import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { TaskStatus, TaskType, TaskPriority, Role } from '@prisma/client'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    switch (req.method) {
      case 'GET':
        return await getTasks(req, res)
      case 'POST':
        return await createTask(req, res)
      default:
        res.setHeader('Allow', ['GET', 'POST'])
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Tasks API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function getTasks(req: NextApiRequest, res: NextApiResponse) {
  const { 
    page = '1', 
    limit = '10', 
    status, 
    priority,
    userId 
  } = req.query

  const pageNum = parseInt(page as string)
  const limitNum = parseInt(limit as string)
  const skip = (pageNum - 1) * limitNum

  const where: any = {}
  if (status) where.status = status
  if (priority) where.priority = priority
  if (userId) where.userId = userId

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        files: {
          select: {
            id: true,
            name: true,
            type: true,
            size: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            messages: true,
            files: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.task.count({ where })
  ])

  return res.status(200).json({
    tasks,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  })
}

async function createTask(req: NextApiRequest, res: NextApiResponse) {
  const {
    description,
    type = TaskType.IMMEDIATE,
    priority = TaskPriority.MEDIUM,
    model,
    files = [],
    userId,
    scheduledFor
  } = req.body

  if (!description) {
    return res.status(400).json({ error: 'Description is required' })
  }

  if (!model) {
    return res.status(400).json({ error: 'Model configuration is required' })
  }

  const task = await prisma.$transaction(async (tx) => {
    // Create the task
    const task = await tx.task.create({
      data: {
        description,
        type,
        priority,
        status: TaskStatus.PENDING,
        createdBy: Role.USER,
        model,
        ...(userId ? { userId } : {}),
        ...(scheduledFor ? { scheduledFor: new Date(scheduledFor) } : {})
      }
    })

    // Save files if provided
    if (files && files.length > 0) {
      const filePromises = files.map((file: any) => {
        const base64Data = file.base64.includes('base64,')
          ? file.base64.split('base64,')[1]
          : file.base64

        return tx.file.create({
          data: {
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            data: base64Data,
            taskId: task.id
          }
        })
      })

      await Promise.all(filePromises)
    }

    // Create initial system message
    let filesDescription = ''
    if (files && files.length > 0) {
      filesDescription = `\n\nFiles uploaded:\n${files.map((f: any) => `- ${f.name}`).join('\n')}`
    }

    await tx.message.create({
      data: {
        content: [
          {
            type: 'text',
            text: `Task: ${description}${filesDescription}`
          }
        ],
        role: Role.USER,
        taskId: task.id,
        ...(userId ? { userId } : {})
      }
    })

    return task
  })

  // Trigger task processing (will be handled by separate endpoint)
  if (task.type === TaskType.IMMEDIATE) {
    // Queue for immediate processing
    await fetch(`${req.headers.origin}/api/tasks/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id })
    }).catch(console.error)
  }

  return res.status(201).json(task)
}
