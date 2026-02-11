# 🎯 PLAN D'INTÉGRATION CLAUDE POUR BOBA CLAUDE

## 📊 ANALYSE COMPARATIVE

**Happy vs Boba Claude:**

| Aspect | Happy | Boba Claude (actuel) | Gap |
|--------|-------|---------------------|-----|
| Auth Claude | OAuth 2.0 + PKCE | ❌ Aucune | CRITIQUE |
| Claude SDK | @anthropic-ai/claude-code | ❌ Aucune | CRITIQUE |
| Backend | Fastify + PostgreSQL + Redis | ❌ Aucun | CRITIQUE |
| Sessions | Persistantes (.jsonl files) | ❌ Simulées | CRITIQUE |
| Messaging | Stream async bidirectionnel | setTimeout demo | CRITIQUE |
| Tool Calls | Permission système complet | ❌ Aucune | Important |
| WebSockets | Socket.io pour real-time | ❌ Aucun | Important |

## 🎯 COMPOSANTS CRITIQUES IDENTIFIÉS

### 1. Authentification Claude (OBLIGATOIRE)
- OAuth 2.0 flow avec PKCE
- Client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
- Endpoints:
  - Auth: `https://claude.ai/oauth/authorize`
  - Token: `https://console.anthropic.com/v1/oauth/token`
- Storage: Token chiffré côté backend

### 2. Claude Code SDK (OBLIGATOIRE)
- Package: `@anthropic-ai/claude-code`
- Fonction principale: `query({ prompt, options })`
- Communication: Spawn process Node.js + stdio streams
- Session tracking via `.jsonl` files

### 3. Backend API (OBLIGATOIRE)
- Fastify server
- Routes:
  - `POST /v1/connect/anthropic/register` - Save token
  - `GET /v1/connect/anthropic/token` - Get token
  - `POST /v1/chat/send` - Send message
  - WebSocket `/ws` - Real-time updates

## 📋 PLAN D'IMPLÉMENTATION EN 4 PHASES

### **PHASE 1: Backend Foundation (2-3h)**

```
✓ Créer apps/api/
  ├── package.json (Fastify, Prisma, @anthropic-ai/claude-code)
  ├── src/
  │   ├── server.ts (Fastify setup)
  │   ├── routes/
  │   │   ├── auth.ts (JWT auth middleware)
  │   │   └── connect.ts (Token management)
  │   └── utils/
  │       └── encrypt.ts (Token encryption)
  └── prisma/
      └── schema.prisma (User, Token models)
```

**Tâches:**
1. Initialiser Fastify avec TypeScript
2. Setup Prisma avec PostgreSQL
3. Créer schema: User, ServiceAccountToken
4. Implémenter encryption/decryption tokens
5. Routes /v1/connect/anthropic/*

### **PHASE 2: Claude OAuth (2-3h)**

```
✓ Frontend: Settings page avec bouton "Connect Claude"
✓ Backend: OAuth endpoints
  - GET /v1/connect/anthropic/params (génère auth URL)
  - GET /v1/connect/anthropic/callback (échange code → token)
✓ Flow complet PKCE
✓ Storage encrypted token
```

**Code clé à adapter de Happy:**
- `authenticateClaude.ts` - PKCE generation
- `connectRoutes.ts` - Token exchange
- Local callback server (port 54545)

### **PHASE 3: Claude SDK Integration (3-4h)**

```
✓ Backend: Claude query handler
  ├── src/claude/
  │   ├── query.ts (Wrapper autour @anthropic-ai/claude-code)
  │   ├── session.ts (Session management)
  │   └── stream.ts (Message streaming)
✓ WebSocket pour real-time
✓ POST /v1/chat/send endpoint
✓ Session persistence (.jsonl files)
```

**Architecture:**
```typescript
// Backend: apps/api/src/claude/query.ts
import { query } from '@anthropic-ai/claude-code'

async function sendToClaude(
  userId: string,
  message: string,
  sessionId?: string
) {
  const token = await getToken(userId, 'anthropic')

  // Setup SDK options
  const options = {
    cwd: getUserWorkspace(userId),
    resume: sessionId,
    model: 'claude-sonnet-4',
    // ... autres options
  }

  // Stream messages
  for await (const msg of query({ prompt, options })) {
    // Emit via WebSocket
    io.to(userId).emit('message', msg)
  }
}
```

### **PHASE 4: Frontend Integration (2h)**

```
✓ Remplacer setTimeout par real WebSocket
✓ Connection status indicator (vert/rouge)
✓ Send message → Backend API
✓ Receive streaming responses
✓ Display tool calls / thinking states
```

**Code:**
```typescript
// Frontend: apps/web/src/hooks/useClaude.ts
import io from 'socket.io-client'

export function useClaude() {
  const [socket, setSocket] = useState<Socket>()
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const s = io(API_URL, { auth: { token } })
    s.on('connect', () => setIsConnected(true))
    s.on('message', handleMessage)
    setSocket(s)
  }, [])

  const sendMessage = async (content: string) => {
    await fetch(`${API_URL}/v1/chat/send`, {
      method: 'POST',
      body: JSON.stringify({ message: content })
    })
  }
}
```

## 🔧 DÉPENDANCES REQUISES

### Backend (apps/api/package.json):
```json
{
  "dependencies": {
    "@anthropic-ai/claude-code": "latest",
    "fastify": "^5.0.0",
    "@fastify/websocket": "^10.0.0",
    "@prisma/client": "^5.0.0",
    "socket.io": "^4.8.0",
    "zod": "^3.23.0",
    "jsonwebtoken": "^9.0.0",
    "bcrypt": "^5.1.0"
  }
}
```

### Frontend (apps/web/package.json):
```json
{
  "dependencies": {
    "socket.io-client": "^4.8.0"
  }
}
```

## 🚀 ORDRE D'EXÉCUTION OPTIMAL

1. **Jour 1: Backend Foundation**
   - Setup Fastify + Prisma
   - Auth JWT
   - Token storage

2. **Jour 2: OAuth Flow**
   - Implement PKCE
   - Callback handler
   - Test with real Claude account

3. **Jour 3: Claude SDK**
   - Install @anthropic-ai/claude-code
   - Implement query wrapper
   - WebSocket streaming

4. **Jour 4: Frontend Integration**
   - Remove setTimeout
   - Real-time messaging
   - Connection indicator

## ⚠️ POINTS CRITIQUES

1. **Token Security**: JAMAIS exposer tokens côté client
2. **Session Files**: Créer workspace dédié par user
3. **Error Handling**: Claude peut timeout, gérer gracefully
4. **Rate Limiting**: Anthropic a des limites, implémenter queue
5. **WebSocket Reconnection**: Auto-reconnect si déconnexion

## 🎬 NEXT STEPS

Commencer par Phase 1: Backend Foundation
