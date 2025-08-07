import { NextApiRequest, NextApiResponse } from 'next'
import { prisma, ensureDatabaseConnection } from '../../lib/prisma'
import { DesktopClient } from '../../lib/desktop-client'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: false,
      desktop: false
    },
    version: process.env.npm_package_version || '1.0.0'
  }

  try {
    // Check database connection
    health.services.database = await ensureDatabaseConnection()

    // Check desktop service if URL is configured
    if (process.env.BYTEBOT_DESKTOP_BASE_URL) {
      const desktopClient = new DesktopClient(process.env.BYTEBOT_DESKTOP_BASE_URL)
      health.services.desktop = await desktopClient.healthCheck()
    }

    // Determine overall status
    const allServicesHealthy = Object.values(health.services).every(status => status === true)
    health.status = allServicesHealthy ? 'healthy' : 'degraded'

    const statusCode = allServicesHealthy ? 200 : 503
    return res.status(statusCode).json(health)
  } catch (error) {
    console.error('Health check error:', error)
    return res.status(503).json({
      ...health,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
