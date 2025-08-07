import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'
import { TaskStatus } from '@prisma/client'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Task ID is required' })
  }

  try {
    switch (req.method) {
      case 'GET':
        return await getTask(id, res)
      case 'PATCH':
        return await updateTask(id, req, res)
      case 'DELETE':
        return await deleteTask(id, res)
      default:
        res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Task API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function getTask(id: string, res: NextApiResponse) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' }
      },
      files: true,
      summaries: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  })

  if (!task) {
    return res.status(404).json({ error: 'Task not found' })
  }

  return res.status(200).json(task)
}

async function updateTask(id: string, req: NextApiRequest, res: NextApiResponse) {
  const { status, priority, description, error, result } = req.body

  const updateData: any = {}
  if (status) {
    updateData.status = status
    if (status === TaskStatus.RUNNING && !updateData.executedAt) {
      updateData.executedAt = new Date()
    }
    if (status === TaskStatus.COMPLETED && !updateData.completedAt) {
      updateData.completedAt = new Date()
    }
  }
  if (priority) updateData.priority = priority
  if (description) updateData.description = description
  if (error) updateData.error = error
  if (result) updateData.result = result

  const task = await prisma.task.update({
    where: { id },
    data: updateData,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      files: true
    }
  })

  return res.status(200).json(task)
}

async function deleteTask(id: string, res: NextApiResponse) {
  try {
    await prisma.task.delete({
      where: { id }
    })
    return res.status(204).end()
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Task not found' })
    }
    throw error
  }
}
