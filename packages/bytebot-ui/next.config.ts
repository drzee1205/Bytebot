import type { NextConfig } from "next";
import dotenv from "dotenv";

dotenv.config();

const nextConfig: NextConfig = {
  // Enable experimental features for Vercel
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma']
  },
  
  // Transpile shared package
  transpilePackages: ['@bytebot/shared'],
  
  // Environment variables
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    BYTEBOT_DESKTOP_BASE_URL: process.env.BYTEBOT_DESKTOP_BASE_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  },

  // API routes configuration
  async rewrites() {
    return [
      {
        source: '/api/desktop/:path*',
        destination: `${process.env.BYTEBOT_DESKTOP_BASE_URL || 'http://localhost:9990'}/:path*`
      }
    ]
  },

  // Headers for SSE
  async headers() {
    return [
      {
        source: '/api/sse/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate'
          },
          {
            key: 'Connection',
            value: 'keep-alive'
          },
          {
            key: 'Content-Type',
            value: 'text/event-stream'
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          }
        ]
      }
    ]
  },

  // Webpack configuration for shared packages
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  }
};

export default nextConfig;
