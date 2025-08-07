import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { taskId } = req.body

  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required' })
  }

  try {
    // Queue task for processing by calling the agent process endpoint
    const processResponse = await fetch(`${req.headers.origin}/api/agent/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId })
    })

    if (!processResponse.ok) {
      throw new Error(`Failed to queue task: ${processResponse.statusText}`)
    }

    const result = await processResponse.json()
    return res.status(200).json(result)
  } catch (error) {
    console.error('Task queue error:', error)
    return res.status(500).json({ error: 'Failed to queue task' })
  }
}
