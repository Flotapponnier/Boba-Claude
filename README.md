# Boba Claude

Multi-tenant web interface for Claude Code CLI with OAuth authentication and persistent chat history.

## Architecture

- **apps/web**: Next.js frontend with real-time chat interface
- **apps/daemon**: WebSocket server that spawns and manages Claude CLI processes
- **apps/api**: Fastify API server for authentication and user management

## Features

- Multi-user support with OAuth authentication
- Each user connects their own Claude subscription
- Persistent chat sessions with resume capability
- Real-time communication via WebSocket
- Tool permission management UI
- Encrypted token storage

## Prerequisites

- Node.js >= 20.0.0
- pnpm
- PostgreSQL database
- Claude CLI installed (`npm install -g @anthropic/claude-cli`)
- Claude OAuth credentials (from Anthropic Console)

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up PostgreSQL database

Create a PostgreSQL database:

```bash
createdb boba_claude
```

### 3. Configure environment variables

#### API Server (`apps/api/.env`)

```bash
cd apps/api
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/boba_claude"
JWT_SECRET="your-secret-key-change-in-production"
ENCRYPTION_KEY="your-32-byte-encryption-key-change-this"
CLAUDE_CLIENT_ID="your-claude-oauth-client-id"
CLAUDE_CLIENT_SECRET="your-claude-oauth-client-secret"
CLAUDE_REDIRECT_URI="http://localhost:3002/api/auth/claude-callback"
FRONTEND_URL="http://localhost:3000"
PORT=3002
```

**Getting Claude OAuth Credentials:**
1. Go to https://console.anthropic.com
2. Navigate to your organization settings
3. Create a new OAuth application
4. Set redirect URI to `http://localhost:3002/api/auth/claude-callback`
5. Copy Client ID and Client Secret to your `.env`

### 4. Run Prisma migrations

```bash
cd apps/api
pnpm prisma migrate dev --name init
pnpm prisma generate
```

### 5. Configure daemon

The daemon will automatically connect to the API server. Make sure to set the API_URL if not using default:

```bash
# In apps/daemon/.env (optional)
API_URL=http://localhost:3002
```

### 6. Configure frontend

```bash
# In apps/web/.env.local (optional)
NEXT_PUBLIC_WS_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3002
```

## Running the Application

You can run all services at once from the root:

```bash
pnpm dev
```

Or run each service individually:

```bash
# Terminal 1 - API Server
cd apps/api
pnpm dev

# Terminal 2 - Daemon
cd apps/daemon
pnpm dev

# Terminal 3 - Frontend
cd apps/web
pnpm dev
```

The services will be available at:
- Frontend: http://localhost:3000
- Daemon: http://localhost:3001 (WebSocket)
- API: http://localhost:3002

## Usage

### First Time Setup

1. Open http://localhost:3000
2. Click "Guest Login" to create an anonymous account
3. Click "Connect Claude" to link your Claude subscription via OAuth
4. A popup window will open - approve the OAuth request
5. Once connected, you can start chatting with Claude

### Creating Chat Sessions

- Click "New Chat" to start a fresh conversation
- Each chat session has its own Claude CLI process
- Sessions persist across page refreshes

### Resuming Sessions

- Click "Resume Session" button
- Paste a Claude session ID from `~/.claude/projects/`
- The conversation history will be loaded automatically

### Tool Permissions

When Claude wants to use a tool (Read, Write, Bash, etc.), a permission modal will appear:
- Click "Allow" to grant permission for that tool use
- Click "Deny" to reject the tool use

## Multi-User Architecture

Each user:
1. Creates an account (guest login or OAuth)
2. Connects their own Claude subscription via OAuth
3. Gets isolated chat sessions with their own Claude token
4. Cannot access other users' sessions

The daemon:
- Authenticates WebSocket connections via JWT
- Fetches user-specific Claude tokens from API
- Spawns Claude CLI processes with user's token
- Enforces session ownership

## Development

### Database Management

```bash
# Create new migration
cd apps/api
pnpm prisma migrate dev --name <migration_name>

# Open Prisma Studio
pnpm prisma studio

# Reset database
pnpm prisma migrate reset
```

### Building for Production

```bash
# Build all apps
pnpm build

# Start production servers
pnpm start
```

## Security Notes

- User tokens are encrypted at rest using AES-256-GCM
- JWT tokens are used for session management
- Each user's Claude processes are isolated
- WebSocket connections require authentication
- CORS is configured for security

## Troubleshooting

### "Authentication required" error
- Make sure you've clicked "Guest Login" first
- Check that the API server is running on port 3002

### "No Claude account connected" error
- Click "Connect Claude" and complete OAuth flow
- Verify your Claude OAuth credentials in `apps/api/.env`

### Sessions not loading
- Check that daemon is running and accessible
- Verify WebSocket connection in browser console
- Ensure you're logged in with valid JWT token

### Database connection errors
- Verify PostgreSQL is running
- Check DATABASE_URL in `apps/api/.env`
- Run `pnpm prisma migrate dev` to apply migrations

## License

MIT
