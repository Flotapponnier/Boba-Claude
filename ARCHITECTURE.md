# 🏗️ BOBA CLAUDE - ARCHITECTURE DÉTAILLÉE

## 📦 STRUCTURE ACTUELLE

```
Boba-Claude/
├── apps/
│   ├── web/                    # Next.js 14 Frontend
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx           # UI principale ✓
│   │   │   │   ├── layout.tsx         # Root layout ✓
│   │   │   │   └── globals.css        # Styles + themes ✓
│   │   │   ├── components/
│   │   │   │   └── ThemeProvider.tsx  # Theme management ✓
│   │   │   └── lib/
│   │   │       └── store.ts           # Zustand stores ✓
│   │   ├── public/
│   │   │   ├── banner.png             # Logo ✓
│   │   │   └── assets/branding/       # Boba characters ✓
│   │   └── package.json               # socket.io-client, zustand ✓
│   │
│   └── api/                    # Fastify Backend
│       ├── src/                       # ❌ TO CREATE
│       ├── prisma/                    # ❌ TO SETUP
│       ├── package.json               # Deps OK, need claude-code
│       └── .env.example               # ✓
│
└── CLAUDE_INTEGRATION_PLAN.md  # Plan général ✓
```

---

## 🎯 ARCHITECTURE BACKEND (apps/api/)

### Structure des dossiers

```
apps/api/
├── src/
│   ├── index.ts                    # Entry point Fastify
│   ├── server.ts                   # Server configuration
│   │
│   ├── config/                     # Configuration
│   │   ├── env.ts                  # Environment variables (Zod)
│   │   └── constants.ts            # App constants
│   │
│   ├── db/                         # Database
│   │   ├── client.ts               # Prisma client singleton
│   │   └── migrations/             # Auto-generated
│   │
│   ├── routes/                     # API Routes
│   │   ├── index.ts                # Route registration
│   │   ├── health.ts               # GET /health
│   │   ├── auth.ts                 # POST /auth/login, /auth/register
│   │   ├── connect.ts              # OAuth Claude endpoints
│   │   └── chat.ts                 # POST /chat/send, GET /chat/history
│   │
│   ├── services/                   # Business Logic
│   │   ├── auth.service.ts         # JWT, passwords
│   │   ├── token.service.ts        # Encrypt/decrypt tokens
│   │   └── chat.service.ts         # Chat management
│   │
│   ├── claude/                     # Claude SDK Integration
│   │   ├── index.ts                # Main export
│   │   ├── sdk.ts                  # @anthropic-ai/claude-code wrapper
│   │   ├── session.ts              # Session management (.jsonl)
│   │   ├── stream.ts               # Message streaming handler
│   │   └── oauth.ts                # PKCE flow implementation
│   │
│   ├── websocket/                  # Real-time Communication
│   │   ├── index.ts                # WebSocket setup
│   │   ├── handlers.ts             # Message handlers
│   │   └── events.ts               # Event types
│   │
│   ├── middleware/                 # Fastify Middleware
│   │   ├── auth.ts                 # JWT verification
│   │   ├── error.ts                # Error handler
│   │   └── cors.ts                 # CORS config
│   │
│   ├── types/                      # TypeScript Types
│   │   ├── index.ts                # Main exports
│   │   ├── api.ts                  # API request/response
│   │   ├── claude.ts               # Claude SDK types
│   │   └── db.ts                   # Database types
│   │
│   └── utils/                      # Utilities
│       ├── logger.ts               # Pino logger
│       ├── crypto.ts               # Encryption helpers
│       └── validators.ts           # Zod schemas
│
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── migrations/                 # Auto-generated
│
├── data/                           # Runtime data
│   ├── boba-claude.db              # SQLite database
│   └── sessions/                   # Claude session files
│       └── user-{id}/
│           └── {session-id}.jsonl
│
├── .env                            # Local env vars
├── .env.example                    # Template ✓
├── tsconfig.json                   # TypeScript config
└── package.json                    # Dependencies
```

---

## 🗄️ DATABASE SCHEMA (Prisma + SQLite)

### prisma/schema.prisma

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:../data/boba-claude.db"
}

generator client {
  provider = "prisma-client-js"
}

// User accounts (simple auth for MVP)
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String   // bcrypt hashed
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tokens    Token[]
  sessions  Session[]
}

// Encrypted API tokens (Claude, OpenAI, etc)
model Token {
  id        String   @id @default(uuid())
  userId    String
  vendor    String   // "anthropic", "openai"
  token     String   // Encrypted with crypto
  expiresAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, vendor])
  @@index([userId])
}

// Claude conversation sessions
model Session {
  id          String   @id @default(uuid())
  userId      String
  claudeId    String?  // Claude session ID from SDK
  name        String   // "Conversation about..."
  lastMessage String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([claudeId])
}
```

---

## 🔐 AUTHENTICATION FLOW

### JWT-based Auth (Simple MVP)

```typescript
// POST /auth/register
{
  email: string
  password: string
  name?: string
}
→ bcrypt hash password
→ Create user in DB
→ Return JWT token

// POST /auth/login
{
  email: string
  password: string
}
→ Verify password
→ Generate JWT token (expires 7d)
→ Return { token, user }

// Middleware: Verify JWT
Authorization: Bearer <token>
→ Decode JWT
→ Attach userId to request
→ Continue
```

---

## 🔗 CLAUDE OAUTH FLOW

### Endpoints

```typescript
// GET /connect/anthropic/params
→ Generate PKCE challenge
→ Generate state token
→ Store in memory (5min TTL)
→ Return auth URL

// GET /connect/anthropic/callback?code=xxx&state=yyy
→ Verify state
→ Exchange code for token (PKCE)
→ Encrypt token
→ Store in DB (Token table)
→ Return success

// GET /connect/anthropic/status
→ Check if user has valid token
→ Return { connected: boolean }

// DELETE /connect/anthropic
→ Delete token from DB
→ Return success
```

### PKCE Implementation (from Happy)

```typescript
// claude/oauth.ts
import { randomBytes, createHash } from 'crypto'

function generatePKCE() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url')

  return { verifier, challenge }
}

const authUrl = `https://claude.ai/oauth/authorize?${new URLSearchParams({
  code: 'true',
  client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  response_type: 'code',
  redirect_uri: 'http://localhost:54545/callback',
  scope: 'user:inference',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  state: state,
})}`
```

---

## 💬 CHAT MESSAGE FLOW

### Architecture

```
Frontend                WebSocket                Backend                 Claude SDK
   |                       |                        |                        |
   |-- Send message ------>|                        |                        |
   |                       |-- emit('message') ---->|                        |
   |                       |                        |-- query() ----------->|
   |                       |                        |                        |
   |                       |                        |<-- stream messages ---|
   |                       |<-- emit('thinking') ---|                        |
   |<-- UI update ---------|                        |                        |
   |                       |<-- emit('assistant')---|                        |
   |<-- Display msg -------|                        |                        |
   |                       |<-- emit('result') -----|                        |
   |<-- Mark complete -----|                        |                        |
```

### WebSocket Events

```typescript
// Client → Server
socket.emit('message', {
  content: string
  sessionId?: string
})

// Server → Client
socket.emit('thinking', { thinking: boolean })
socket.emit('system', { type: 'init', session_id: string })
socket.emit('assistant', { content: string })
socket.emit('tool_use', { tool: string, input: any })
socket.emit('result', { success: boolean })
socket.emit('error', { message: string })
```

### REST API (Alternative to WebSocket)

```typescript
// POST /chat/send
{
  message: string
  sessionId?: string
}
→ Stream-SSE response (Server-Sent Events)
→ Or regular JSON response

// GET /chat/history?sessionId=xxx
→ Return message history from .jsonl file
```

---

## 🎯 CLAUDE SDK INTEGRATION

### Main Wrapper (claude/sdk.ts)

```typescript
import { query } from '@anthropic-ai/claude-code'

export async function sendToClaude(
  userId: string,
  message: string,
  sessionId?: string,
  onMessage: (msg: ClaudeMessage) => void
) {
  // 1. Get user's Claude token
  const token = await getClaudeToken(userId)
  if (!token) throw new Error('Claude not connected')

  // 2. Setup workspace
  const workspace = path.join(__dirname, '../../data/sessions', userId)
  await fs.mkdir(workspace, { recursive: true })

  // 3. Configure SDK
  const options = {
    cwd: workspace,
    resume: sessionId,
    model: 'claude-sonnet-4-20250514',
    permissionMode: 'ask',
    // Inject token via env or config
  }

  // 4. Stream messages
  const messages = createAsyncIterable(message)

  for await (const msg of query({ prompt: messages, options })) {
    onMessage(msg)

    // Handle different message types
    if (msg.type === 'system' && msg.subtype === 'init') {
      // New session created
      await saveSession(userId, msg.session_id)
    }

    if (msg.type === 'result') {
      // Conversation complete
      break
    }
  }
}
```

---

## 🔒 SECURITY

### Token Encryption

```typescript
// utils/crypto.ts
import crypto from 'crypto'

const algorithm = 'aes-256-gcm'
const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex') // 32 bytes

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, key, iv)

  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decryptToken(encrypted: string): string {
  const [ivHex, authTagHex, encryptedData] = encrypted.split(':')

  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(ivHex, 'hex')
  )

  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
```

---

## 🚀 DEPLOYMENT

### Environment Variables

```env
# Server
NODE_ENV=development
PORT=4000
HOST=0.0.0.0

# Database
DATABASE_URL=file:../data/boba-claude.db

# Security
JWT_SECRET=your-super-secret-jwt-key-change-in-production
ENCRYPTION_KEY=64-char-hex-string-for-aes-256

# Claude OAuth
CLAUDE_CLIENT_ID=9d1c250a-e61b-44d9-88ed-5944d1962f5e
CLAUDE_CALLBACK_PORT=54545

# Cors
FRONTEND_URL=http://localhost:3000
```

### Run Commands

```bash
# Development
cd apps/api
npm run dev          # tsx watch src/index.ts

# Database
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Run migrations

# Production
npm run build        # Compile TypeScript
npm start           # Run compiled code
```

---

## 📊 PERFORMANCE CONSIDERATIONS

### Rate Limiting

```typescript
// middleware/rateLimit.ts
import rateLimit from '@fastify/rate-limit'

fastify.register(rateLimit, {
  max: 100,              // 100 requests
  timeWindow: '15 minutes'
})
```

### WebSocket Connection Limits

```typescript
const connectedUsers = new Map<string, WebSocket>()

// Limit 1 connection per user
if (connectedUsers.has(userId)) {
  connectedUsers.get(userId)!.close()
}
connectedUsers.set(userId, ws)
```

---

## ✅ TESTING STRATEGY

### Unit Tests
- `crypto.test.ts` - Encryption/decryption
- `auth.service.test.ts` - JWT generation
- `token.service.test.ts` - Token CRUD

### Integration Tests
- OAuth flow end-to-end
- WebSocket message flow
- Claude SDK integration

### E2E Tests
- Complete user journey
- Frontend → Backend → Claude

---

## 🎬 IMPLEMENTATION ORDER

### Phase 1: Foundation (Today)
1. ✅ Setup Prisma schema
2. ✅ Install dependencies
3. ✅ Create folder structure
4. ✅ Basic Fastify server
5. ✅ Auth endpoints

### Phase 2: Claude OAuth (Tomorrow)
1. PKCE implementation
2. OAuth endpoints
3. Token encryption
4. Frontend connect button

### Phase 3: Claude SDK (Day 3)
1. SDK wrapper
2. Message streaming
3. Session management
4. WebSocket integration

### Phase 4: Frontend (Day 4)
1. Remove mock data
2. Real WebSocket connection
3. Message display
4. Error handling

---

**Ready to start Phase 1? 🚀**
