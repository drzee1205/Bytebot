import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { TaskStatus, Role } from '@prisma/client'
import { broadcastTaskUpdate, broadcastMessageUpdate } from '../sse/tasks'

// AI Provider imports
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/genai'

// Desktop service client
import { DesktopClient } from '../../../lib/desktop-client'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { taskId } = req.body

  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required' })
  }

  try {
    // Get task with messages and files
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        files: true
      }
    })

    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    if (task.status !== TaskStatus.PENDING) {
      return res.status(400).json({ error: 'Task is not in pending status' })
    }

    // Update task status to running
    await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: TaskStatus.RUNNING,
        executedAt: new Date()
      }
    })

    // Broadcast status update
    broadcastTaskUpdate(taskId, { status: TaskStatus.RUNNING })

    // Process task asynchronously
    processTaskAsync(task)
      .catch(error => {
        console.error('Task processing error:', error)
        // Update task status to failed
        prisma.task.update({
          where: { id: taskId },
          data: { 
            status: TaskStatus.FAILED,
            error: error.message,
            completedAt: new Date()
          }
        }).then(() => {
          broadcastTaskUpdate(taskId, { 
            status: TaskStatus.FAILED, 
            error: error.message 
          })
        })
      })

    return res.status(200).json({ message: 'Task processing started' })
  } catch (error) {
    console.error('Agent process error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function processTaskAsync(task: any) {
  const { model } = task
  const desktopClient = new DesktopClient(process.env.BYTEBOT_DESKTOP_BASE_URL!)

  try {
    // Initialize AI client based on model provider
    let aiClient: any
    switch (model.provider) {
      case 'anthropic':
        aiClient = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        })
        break
      case 'openai':
        aiClient = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        })
        break
      case 'google':
        aiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
        break
      default:
        throw new Error(`Unsupported AI provider: ${model.provider}`)
    }

    // Build conversation history
    const messages = task.messages.map((msg: any) => ({
      role: msg.role === Role.USER ? 'user' : 'assistant',
      content: msg.content
    }))

    // Add system prompt
    const systemPrompt = getSystemPrompt()
    
    // Process with AI
    let response: any
    if (model.provider === 'anthropic') {
      response = await aiClient.messages.create({
        model: model.name,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: getComputerTools()
      })
    } else if (model.provider === 'openai') {
      response = await aiClient.chat.completions.create({
        model: model.name,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        tools: getComputerTools(),
        tool_choice: 'auto'
      })
    }

    // Process AI response and handle tool calls
    await processAIResponse(task.id, response, desktopClient, model.provider)

  } catch (error) {
    console.error('Task processing error:', error)
    throw error
  }
}

async function processAIResponse(taskId: string, response: any, desktopClient: DesktopClient, provider: string) {
  // Save AI response as message
  const messageContent = provider === 'anthropic' 
    ? response.content 
    : [{ type: 'text', text: response.choices[0].message.content }]

  const message = await prisma.message.create({
    data: {
      content: messageContent,
      role: Role.ASSISTANT,
      taskId
    }
  })

  broadcastMessageUpdate(taskId, message)

  // Handle tool calls
  const toolCalls = provider === 'anthropic' 
    ? response.content.filter((block: any) => block.type === 'tool_use')
    : response.choices[0].message.tool_calls || []

  for (const toolCall of toolCalls) {
    try {
      const result = await executeToolCall(toolCall, desktopClient, provider)
      
      // Save tool result as message
      const toolResultMessage = await prisma.message.create({
        data: {
          content: [{
            type: 'tool_result',
            tool_use_id: provider === 'anthropic' ? toolCall.id : toolCall.id,
            content: result
          }],
          role: Role.ASSISTANT,
          taskId
        }
      })

      broadcastMessageUpdate(taskId, toolResultMessage)
    } catch (error) {
      console.error('Tool execution error:', error)
      
      // Save error as message
      const errorMessage = await prisma.message.create({
        data: {
          content: [{
            type: 'tool_result',
            tool_use_id: provider === 'anthropic' ? toolCall.id : toolCall.id,
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            is_error: true
          }],
          role: Role.ASSISTANT,
          taskId
        }
      })

      broadcastMessageUpdate(taskId, errorMessage)
    }
  }

  // Check if task should be marked as completed
  const hasSetTaskStatus = toolCalls.some((call: any) => 
    (provider === 'anthropic' ? call.name : call.function.name) === 'set_task_status'
  )

  if (hasSetTaskStatus) {
    // Task completion will be handled by the set_task_status tool
    return
  }

  // Continue processing if needed (implement conversation loop)
  // For now, mark as completed if no more tool calls
  if (toolCalls.length === 0) {
    await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: TaskStatus.COMPLETED,
        completedAt: new Date()
      }
    })

    broadcastTaskUpdate(taskId, { status: TaskStatus.COMPLETED })
  }
}

async function executeToolCall(toolCall: any, desktopClient: DesktopClient, provider: string) {
  const toolName = provider === 'anthropic' ? toolCall.name : toolCall.function.name
  const toolInput = provider === 'anthropic' ? toolCall.input : JSON.parse(toolCall.function.arguments)

  switch (toolName) {
    case 'computer_screenshot':
      return await desktopClient.screenshot()
    
    case 'computer_click_mouse':
      return await desktopClient.clickMouse(toolInput)
    
    case 'computer_type_text':
      return await desktopClient.typeText(toolInput)
    
    case 'computer_move_mouse':
      return await desktopClient.moveMouse(toolInput)
    
    case 'computer_application':
      return await desktopClient.switchApplication(toolInput)
    
    case 'set_task_status':
      return await handleSetTaskStatus(toolCall.taskId || toolInput.taskId, toolInput)
    
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}

async function handleSetTaskStatus(taskId: string, input: any) {
  const { status, description } = input
  
  const updateData: any = {
    status,
    completedAt: new Date()
  }

  if (description) {
    updateData.result = { description }
  }

  await prisma.task.update({
    where: { id: taskId },
    data: updateData
  })

  broadcastTaskUpdate(taskId, { status, result: updateData.result })

  return { success: true, status, description }
}

function getSystemPrompt(): string {
  return `You are Bytebot, a highly-reliable AI engineer operating a virtual computer whose display measures 1280 x 960 pixels.

The current date is ${new Date().toLocaleDateString()}. The current time is ${new Date().toLocaleTimeString()}.

You have access to computer tools to interact with the desktop. Always take a screenshot first to see the current state.

Available applications:
- Firefox Browser
- Visual Studio Code  
- Terminal
- File Manager

Core principles:
1. Always take a screenshot before your first action
2. Use computer tools to interact with applications
3. Complete the user's task thoroughly
4. When finished, call set_task_status with "completed" status`
}

function getComputerTools() {
  return [
    {
      name: 'computer_screenshot',
      description: 'Take a screenshot of the current desktop',
      input_schema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'computer_click_mouse',
      description: 'Click the mouse at specified coordinates',
      input_schema: {
        type: 'object',
        properties: {
          coordinates: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['x', 'y']
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            default: 'left'
          },
          clickCount: {
            type: 'integer',
            default: 1
          }
        },
        required: ['coordinates']
      }
    },
    {
      name: 'computer_type_text',
      description: 'Type text at the current cursor position',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string' }
        },
        required: ['text']
      }
    },
    {
      name: 'computer_move_mouse',
      description: 'Move mouse to specified coordinates',
      input_schema: {
        type: 'object',
        properties: {
          coordinates: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['x', 'y']
          }
        },
        required: ['coordinates']
      }
    },
    {
      name: 'computer_application',
      description: 'Switch to or open an application',
      input_schema: {
        type: 'object',
        properties: {
          application: {
            type: 'string',
            enum: ['firefox', 'vscode', 'terminal', 'directory', 'desktop']
          }
        },
        required: ['application']
      }
    },
    {
      name: 'set_task_status',
      description: 'Set the task status when completed or failed',
      input_schema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['completed', 'failed', 'needs_help']
          },
          description: { type: 'string' }
        },
        required: ['status']
      }
    }
  ]
}
