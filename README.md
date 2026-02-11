# Boba Claude

A production-ready web platform enabling secure, mobile-accessible interaction with Claude AI, featuring persistent conversation history, session management, and code execution capabilities.

## Overview

Boba Claude is a cloud-native application designed to provide seamless access to Claude AI from any device. Unlike complex multi-machine architectures, Boba Claude focuses on simplicity, reliability, and user experience while maintaining enterprise-grade security and scalability.

## Core Features

- **Universal Access**: Web-based interface accessible from desktop and mobile devices
- **Persistent Memory**: Full conversation history with intelligent session management
- **Code Execution**: Isolated sandbox environment for safe code execution
- **Session Management**: Create, rename, delete, and organize AI conversations
- **Real-time Sync**: WebSocket-based live updates across devices
- **Authentication**: Secure JWT-based authentication with session management
- **Rate Limiting**: Built-in protection against API abuse
- **Timeout Control**: Configurable session and request timeouts

## Architecture

### Technology Stack

**Frontend (Next.js 14+)**
- React 18 with App Router
- TypeScript for type safety
- Tailwind CSS for responsive design
- Zustand for state management
- React Query for data fetching
- Socket.io client for real-time updates

**Backend (Node.js)**
- Fastify for high-performance API server
- Prisma ORM with PostgreSQL
- Redis for session storage and caching
- Socket.io for WebSocket connections
- Docker for code execution isolation
- Bull for background job processing

**Infrastructure**
- Docker containers for all services
- Kubernetes for orchestration
- PostgreSQL 16 for persistent storage
- Redis 7 for caching and sessions
- Nginx for reverse proxy and SSL termination

### Project Structure

```
boba-claude/
├── apps/
│   ├── web/              # Next.js frontend application
│   │   ├── src/
│   │   │   ├── app/      # Next.js app router pages
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── lib/      # Utilities and configurations
│   │   │   └── types/
│   │   └── public/
│   └── api/              # Fastify backend application
│       ├── src/
│       │   ├── routes/   # API endpoints
│       │   ├── services/ # Business logic
│       │   ├── models/   # Database models
│       │   ├── middleware/
│       │   └── utils/
│       └── prisma/       # Database schemas and migrations
├── packages/
│   └── shared/           # Shared types and utilities
│       ├── types/
│       └── utils/
├── infrastructure/
│   ├── docker/           # Dockerfiles
│   ├── kubernetes/       # K8s manifests
│   └── nginx/            # Nginx configuration
├── public/
│   └── assets/
│       └── branding/     # Boba logos and brand assets
└── docs/                 # Additional documentation
```

## Security Features

- API keys stored securely on backend only
- JWT-based authentication with refresh tokens
- Rate limiting per user and global
- Code execution in isolated Docker containers
- Input sanitization and validation
- CORS configuration for production
- Environment-based secrets management
- Automatic session expiration

## Deployment

### Prerequisites

- Docker 24+
- Kubernetes cluster (or local with Minikube/Kind)
- PostgreSQL 16
- Redis 7
- Node.js 20+

### Environment Variables

```env
# Backend
DATABASE_URL=postgresql://user:pass@localhost:5432/boba
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=your-secret-key
SESSION_TIMEOUT_MINUTES=30

# Frontend
NEXT_PUBLIC_API_URL=https://api.boba-claude.com
```

### Local Development

```bash
# Install dependencies
pnpm install

# Run database migrations
cd apps/api && pnpm prisma migrate dev

# Start development servers
pnpm dev
```

### Production Deployment

```bash
# Build Docker images
docker build -t boba-claude-web:latest -f infrastructure/docker/Dockerfile.web .
docker build -t boba-claude-api:latest -f infrastructure/docker/Dockerfile.api .

# Deploy to Kubernetes
kubectl apply -f infrastructure/kubernetes/
```

## Roadmap

### Phase 1: Core Platform (Current)
- Web interface with chat functionality
- Session management (create, rename, delete)
- Claude API integration
- Basic authentication
- Kubernetes deployment

### Phase 2: Enhanced Features
- File upload and context management
- Code execution sandbox
- Advanced session search and filtering
- Team collaboration features
- Usage analytics dashboard

### Phase 3: Mobile Experience
- Progressive Web App (PWA) optimization
- Native mobile apps (React Native)
- Offline mode with sync
- Push notifications

### Phase 4: Enterprise Features
- Multi-tenant support
- SSO integration
- Advanced permission management
- Audit logging
- Custom model configurations

## Performance Goals

- Page load time: < 1s
- API response time: < 200ms (p95)
- WebSocket latency: < 50ms
- Concurrent users: 10,000+
- Uptime: 99.9%

## Contributing

This is a private project for Mobula internal use. For questions or suggestions, contact the development team.

## License

Proprietary - All rights reserved
