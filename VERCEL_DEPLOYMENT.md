# Bytebot Vercel Deployment Guide

This guide explains how to deploy Bytebot to Vercel's serverless platform.

## 🏗️ Architecture Overview

The Vercel deployment uses a hybrid architecture:

- **Vercel**: Hosts the Next.js UI and serverless API routes
- **External Service**: Hosts the desktop daemon (bytebotd) on a traditional platform
- **Database**: PostgreSQL (Vercel Postgres or external)

## 📋 Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Database**: Set up PostgreSQL (Vercel Postgres recommended)
3. **Desktop Service**: Deploy bytebotd to a traditional hosting platform
4. **AI API Keys**: Get keys for Anthropic, OpenAI, and/or Google

## 🚀 Deployment Steps

### 1. Prepare the Repository

```bash
# Clone the repository
git clone <your-repo-url>
cd bytebot

# Install dependencies
npm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file in `packages/bytebot-ui/`:

```env
# Database
DATABASE_URL="postgresql://username:password@host:port/database"
DIRECT_URL="postgresql://username:password@host:port/database"

# Desktop Service (external)
BYTEBOT_DESKTOP_BASE_URL="https://your-desktop-service.com"

# AI Providers
ANTHROPIC_API_KEY="your-anthropic-key"
OPENAI_API_KEY="your-openai-key"
GEMINI_API_KEY="your-gemini-key"

# Authentication (optional)
AUTH_SECRET="your-auth-secret"
AUTH_ENABLED="true"
```

### 3. Deploy to Vercel

#### Option A: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from the UI directory
cd packages/bytebot-ui
vercel

# Follow the prompts to configure your project
```

#### Option B: GitHub Integration

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy automatically on push

### 4. Configure Environment Variables in Vercel

In your Vercel dashboard:

1. Go to Project Settings → Environment Variables
2. Add all the variables from your `.env.local` file
3. Set them for Production, Preview, and Development environments

### 5. Set Up Database

#### Using Vercel Postgres:

```bash
# Install Vercel Postgres
vercel postgres create

# Get connection string and add to environment variables
```

#### Using External Database:

1. Create a PostgreSQL database
2. Run migrations:

```bash
cd packages/bytebot-ui
npx prisma migrate deploy
```

### 6. Deploy Desktop Service

The desktop daemon must be deployed separately to a platform that supports:
- Docker containers with privileged access
- Ubuntu/Linux environment
- VNC server capabilities

**Recommended Platforms:**
- Railway
- Render
- DigitalOcean App Platform
- AWS ECS
- Google Cloud Run (with appropriate permissions)

**Deployment Steps:**
1. Build the bytebotd Docker image
2. Deploy to your chosen platform
3. Ensure the service is accessible via HTTP
4. Update `BYTEBOT_DESKTOP_BASE_URL` in Vercel

## 🔧 Configuration Details

### Vercel Project Settings

The `vercel.json` configuration includes:

- **Build Settings**: Handles monorepo structure
- **Function Timeouts**: Extended for AI processing
- **Environment Variables**: Secure API key management
- **Cron Jobs**: Scheduled task processing

### API Routes Structure

```
/api/
├── tasks/
│   ├── index.ts          # List/create tasks
│   ├── [id].ts           # Get/update/delete task
│   ├── queue.ts          # Queue task for processing
│   └── messages.ts       # Add messages to tasks
├── agent/
│   └── process.ts        # AI agent processing
├── sse/
│   └── tasks.ts          # Server-sent events
└── health.ts             # Health check endpoint
```

### Database Schema

The Prisma schema is optimized for serverless with:
- Connection pooling configuration
- Proper indexes for performance
- Serverless-friendly connection management

## 🔍 Monitoring & Debugging

### Health Checks

- **Endpoint**: `/api/health`
- **Monitors**: Database connectivity, desktop service status
- **Response**: JSON with service status

### Logs

- **Vercel Functions**: View in Vercel dashboard
- **Desktop Service**: Check your hosting platform logs
- **Database**: Monitor connection pool usage

### Common Issues

1. **Cold Starts**: First request may be slow
2. **Connection Limits**: Monitor database connections
3. **Timeout Issues**: Adjust function timeouts for long-running tasks
4. **Desktop Service**: Ensure external service is accessible

## 🔒 Security Considerations

### Environment Variables
- Store all secrets in Vercel environment variables
- Never commit API keys to version control
- Use different keys for different environments

### Desktop Service Security
- Implement authentication for desktop service API
- Use HTTPS for all external communications
- Consider VPN or private networking for sensitive deployments

### Database Security
- Use connection pooling to prevent exhaustion
- Enable SSL connections
- Implement proper access controls

## 📊 Performance Optimization

### Serverless Functions
- Keep functions lightweight
- Use connection pooling for database
- Implement proper error handling

### Real-time Updates
- Server-Sent Events for real-time communication
- Connection management for multiple clients
- Heartbeat mechanism for connection health

### Caching
- Static assets cached by Vercel CDN
- Database query optimization
- Implement Redis for session management (optional)

## 🔄 CI/CD Pipeline

### Automatic Deployments
```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

### Database Migrations
```bash
# Run migrations on deployment
npx prisma migrate deploy
```

## 🆘 Troubleshooting

### Common Deployment Issues

1. **Build Failures**
   - Check shared package dependencies
   - Verify Prisma client generation
   - Review build logs in Vercel dashboard

2. **Runtime Errors**
   - Check environment variables
   - Verify database connectivity
   - Monitor function logs

3. **Desktop Service Connection**
   - Verify external service URL
   - Check network connectivity
   - Review authentication setup

### Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Prisma Serverless](https://www.prisma.io/docs/guides/deployment/serverless)

## 🎯 Next Steps

After successful deployment:

1. **Test Core Functionality**: Create and process tasks
2. **Monitor Performance**: Check function execution times
3. **Scale Desktop Services**: Add multiple desktop instances
4. **Implement Authentication**: Set up user management
5. **Add Monitoring**: Implement comprehensive logging

## 📞 Support

For deployment issues or questions:
- Check the GitHub repository issues
- Review Vercel deployment logs
- Verify all environment variables are set correctly

