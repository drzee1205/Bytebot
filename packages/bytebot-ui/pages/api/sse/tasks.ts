import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

// Store active connections
const connections = new Map<string, NextApiResponse>()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { taskId, userId } = req.query
  const connectionId = `${Date.now()}-${Math.random()}`

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  })

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    connectionId,
    timestamp: new Date().toISOString()
  })}\n\n`)

  // Store connection
  connections.set(connectionId, res)

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    if (connections.has(connectionId)) {
      res.write(`data: ${JSON.stringify({ 
        type: 'heartbeat', 
        timestamp: new Date().toISOString()
      })}\n\n`)
    } else {
      clearInterval(heartbeat)
    }
  }, 30000)

  // If specific task requested, send initial task data
  if (taskId && typeof taskId === 'string') {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 5
          },
          files: {
            select: {
              id: true,
              name: true,
              type: true,
              size: true,
              createdAt: true
            }
          }
        }
      })

      if (task) {
        res.write(`data: ${JSON.stringify({
          type: 'task_update',
          task,
          timestamp: new Date().toISOString()
        })}\n\n`)
      }
    } catch (error) {
      console.error('Error fetching initial task data:', error)
    }
  }

  // Clean up on client disconnect
  req.on('close', () => {
    connections.delete(connectionId)
    clearInterval(heartbeat)
  })

  req.on('end', () => {
    connections.delete(connectionId)
    clearInterval(heartbeat)
  })
}

// Helper function to broadcast updates to all connected clients
export function broadcastTaskUpdate(taskId: string, update: any) {
  const message = JSON.stringify({
    type: 'task_update',
    taskId,
    update,
    timestamp: new Date().toISOString()
  })

  connections.forEach((res, connectionId) => {
    try {
      res.write(`data: ${message}\n\n`)
    } catch (error) {
      console.error(`Error sending update to connection ${connectionId}:`, error)
      connections.delete(connectionId)
    }
  })
}

// Helper function to broadcast message updates
export function broadcastMessageUpdate(taskId: string, message: any) {
  const updateMessage = JSON.stringify({
    type: 'message_update',
    taskId,
    message,
    timestamp: new Date().toISOString()
  })

  connections.forEach((res, connectionId) => {
    try {
      res.write(`data: ${updateMessage}\n\n`)
    } catch (error) {
      console.error(`Error sending message update to connection ${connectionId}:`, error)
      connections.delete(connectionId)
    }
  })
}

// Helper function to get connection count
export function getConnectionCount(): number {
  return connections.size
}
