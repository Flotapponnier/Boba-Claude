# Technology Stack Rationale

## Stack Overview

**Monorepo**: pnpm workspaces
**Frontend**: Next.js 14 (App Router) + React 18 + TypeScript
**Backend**: Fastify + Node.js + TypeScript
**Database**: PostgreSQL 16 + Prisma ORM
**Cache**: Redis 7
**Real-time**: Socket.io
**Container**: Docker + Kubernetes
**AI**: Anthropic Claude API

## Why This Stack?

### Frontend: Next.js 14

**Chosen over**: Vite + React, Remix, SvelteKit

**Reasons**:
- Server-side rendering for better mobile performance and SEO
- App Router provides excellent developer experience
- Built-in optimization (image, font, bundle splitting)
- Excellent TypeScript support
- Large ecosystem and community
- Easy deployment to Vercel or any Node.js host
- API routes for BFF pattern if needed

**Mobile-first**: Next.js renders fast on mobile devices with automatic code splitting and progressive hydration.

### Backend: Fastify

**Chosen over**: Express, Nest.js, Hono

**Reasons**:
- 2x faster than Express (critical for API responsiveness)
- Built-in TypeScript support
- Schema validation with JSON Schema
- Plugin architecture for modularity
- Excellent async/await handling
- Lower memory footprint
- WebSocket support via @fastify/websocket

**Performance**: Critical for handling concurrent Claude API calls and real-time updates.

### Database: PostgreSQL + Prisma

**Chosen over**: MySQL + TypeORM, MongoDB + Mongoose

**Reasons**:
- PostgreSQL: ACID compliance, jsonb for flexible metadata, excellent performance
- Prisma: Type-safe queries, automatic migrations, great DX
- Better handling of complex queries for session management
- Strong consistency guarantees for user data
- Full-text search capabilities for conversation history

**Alternative considered**: Supabase (PostgreSQL + Auth + Real-time), but kept simple for full control.

### Cache: Redis

**Chosen over**: Memcached, built-in memory

**Reasons**:
- Session storage with automatic expiration
- Rate limiting with atomic operations
- Pub/sub for horizontal scaling
- Persistent cache for conversation context
- Bull queue for background jobs (code execution)

### Real-time: Socket.io

**Chosen over**: Native WebSocket, Server-Sent Events, WebRTC

**Reasons**:
- Automatic reconnection and fallback
- Room-based broadcasting for multi-device sync
- Binary support for file transfers
- Battle-tested in production
- Works reliably across proxies and firewalls

### Container: Docker + Kubernetes

**Chosen over**: Docker Compose, AWS ECS, Cloud Run

**Reasons**:
- Industry standard for orchestration
- Horizontal scaling with HPA
- Self-healing and rolling updates
- Works on any cloud (AWS, GCP, Azure)
- Local development with Minikube
- Service mesh ready (Istio) for future

**Simplicity**: Single deployment.yaml for full infrastructure.

### Monorepo: pnpm workspaces

**Chosen over**: npm workspaces, Yarn, Turborepo, Nx

**Reasons**:
- Fastest package manager (strict dependency resolution)
- Smallest disk usage with content-addressable storage
- Simple workspace protocol
- No additional tooling needed
- Better monorepo support than npm/yarn

**Alternative**: Turborepo adds caching but unnecessary for current scale.

## Performance Targets

| Metric | Target | Stack Impact |
|--------|--------|--------------|
| Page Load (FCP) | < 1s | Next.js SSR + Code Splitting |
| API Response (p95) | < 200ms | Fastify + Redis Cache |
| WebSocket Latency | < 50ms | Socket.io Direct Connection |
| Concurrent Users | 10,000+ | Kubernetes HPA + Stateless Design |
| Database Queries | < 50ms | Prisma Query Optimization + Indexes |

## Security Architecture

```
Mobile/Web Browser
    ↓ HTTPS
Next.js Frontend (Public)
    ↓ JWT Token
Fastify API (Internal)
    ↓ Environment Variable
Claude API (Anthropic)
    ↓ Isolated
Docker Container (Code Execution)
```

**Key Security Features**:
- API keys never exposed to frontend
- JWT with short expiration + refresh tokens
- Rate limiting per user (Redis)
- Code execution in isolated Docker containers
- Input validation with Zod schemas
- SQL injection prevention via Prisma
- XSS protection via React's automatic escaping

## Scalability Plan

### Phase 1: Single Region (Current)
- 3 API pods
- 2 Web pods
- 1 PostgreSQL instance (with replicas)
- 1 Redis instance (with sentinel)

### Phase 2: Multi-Region
- Global load balancer (Cloudflare)
- Regional Kubernetes clusters
- PostgreSQL read replicas per region
- Redis cluster mode

### Phase 3: Enterprise Scale
- Distributed tracing (Jaeger)
- Metrics (Prometheus + Grafana)
- Log aggregation (Loki)
- Service mesh (Istio)
- CDN for static assets

## Alternative Stacks Considered

### Option A: All-in-One Framework
**Stack**: Supabase + Next.js
**Pros**: Fastest development, built-in auth/db/real-time
**Cons**: Vendor lock-in, less control, harder to customize

### Option B: Microservices
**Stack**: Kong Gateway + Multiple Services
**Pros**: Better separation, independent scaling
**Cons**: Over-engineering for current needs, operational complexity

### Option C: Serverless
**Stack**: Vercel + AWS Lambda + DynamoDB
**Pros**: Auto-scaling, pay-per-use
**Cons**: Cold starts, harder to debug, WebSocket limitations

**Decision**: Chose balanced approach (Option Current) for control, performance, and reasonable complexity.

## Cost Estimation (Monthly)

### Development
- Local development: $0
- GitHub: $0 (private repo)
- Testing: $50 (small Kubernetes cluster)

### Production (Small Scale, <1000 users)
- Kubernetes cluster: $100 (3 nodes)
- PostgreSQL: $50 (managed service)
- Redis: $30 (managed service)
- Load balancer: $20
- Storage: $10
- **Total**: ~$210/month

### Production (Medium Scale, 10,000 users)
- Kubernetes cluster: $500 (10 nodes with HPA)
- PostgreSQL: $200 (with read replicas)
- Redis: $100 (cluster mode)
- Load balancer: $50
- Storage: $50
- Monitoring: $50
- **Total**: ~$950/month

**Note**: Claude API costs separate (pay-per-token).

## Development Timeline

### Week 1: Foundation
- Backend API structure
- Database schema and migrations
- Authentication system
- Basic CRUD for sessions

### Week 2: Core Features
- Claude API integration
- Message streaming
- Real-time updates (Socket.io)
- Session management UI

### Week 3: Enhancement
- Code execution sandbox
- File upload
- Advanced search
- Performance optimization

### Week 4: Production Ready
- Docker images
- Kubernetes manifests
- CI/CD pipeline
- Monitoring and logging
- Security audit
- Load testing

## Conclusion

This stack balances:
- **Developer Experience**: TypeScript everywhere, hot reload, good tooling
- **Performance**: Fastify + Redis + efficient DB queries
- **Scalability**: Kubernetes + stateless design
- **Maintainability**: Monorepo + type safety + clear architecture
- **Cost**: Open source stack, no vendor lock-in

The architecture is production-ready while remaining simple enough for a small team to maintain and extend.
