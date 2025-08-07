import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { Role } from '@prisma/client'
import { broadcastMessageUpdate } from '../sse/tasks'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { taskId, content, role = Role.USER, userId } = req.body

  if (!taskId || !content) {
    return res.status(400).json({ error: 'Task ID and content are required' })
  }

  try {
    const message = await prisma.message.create({
      data: {
        content,
        role,
        taskId,
        ...(userId ? { userId } : {})
      }
    })

    // Broadcast the new message to connected clients
    broadcastMessageUpdate(taskId, message)

    return res.status(201).json(message)
  } catch (error) {
    console.error('Message creation error:', error)
    return res.status(500).json({ error: 'Failed to create message' })
  }
}
