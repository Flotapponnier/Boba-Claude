# Boba Claude

Cloud-based Claude CLI interface with SSH architecture and persistent sessions.

## Architecture

**3 main components:**
1. **Web App** (Next.js) - User interface
2. **API** (Fastify + PostgreSQL) - Auth, sessions, workspaces
3. **Cloud Daemon** (Node.js + Socket.IO) - Manages Claude sessions via SSH

**Flow:**
```
Browser → WebSocket → Cloud Daemon (VPS) → SSH → Remote Machine (Claude CLI)
                         ↓
                   PostgreSQL (persistence)
```

## Quick Start

### Prerequisites
- Node.js 18+ or Bun
- PostgreSQL database
- SSH access to a remote machine with Claude CLI installed

### Installation

```bash
# Clone repo
git clone <repo>
cd Boba-Claude

# Install dependencies
bun install
cd apps/api && bun install
cd ../daemon && bun install
cd ../web && bun install
```

### Database Setup

```bash
# Create .env in apps/api/
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/boba_claude"' > apps/api/.env

# Run migrations
cd apps/api
bunx prisma migrate dev
```

### Environment Variables

**apps/api/.env:**
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/boba_claude"
JWT_SECRET="your-secret-key"
```

**apps/daemon/.env:**
```env
API_URL="http://localhost:3002"
```

**apps/web/.env.local:**
```env
NEXT_PUBLIC_API_URL="http://localhost:3002"
NEXT_PUBLIC_WS_URL="http://localhost:3001"
```

### Running the Services

**Terminal 1 - API:**
```bash
cd apps/api
bun dev  # Port 3002
```

**Terminal 2 - Cloud Daemon:**
```bash
cd apps/daemon
bun dev  # Port 3001
```

**Terminal 3 - Web:**
```bash
cd apps/web
bun dev  # Port 3000
```

## SSH Configuration

### Via Web Interface

1. Login with Phantom wallet
2. Create a workspace with:
   - **Host:** Your remote machine IP (e.g., `57.130.19.92`)
   - **Port:** SSH port (default: `22`)
   - **User:** SSH username (e.g., `rescue`)
   - **Password:** SSH password (or use key-based auth)
   - **Working Dir:** Claude working directory (e.g., `/home/rescue`)

### Via API

```bash
curl -X POST http://localhost:3002/api/workspaces \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-workspace",
    "sshHost": "57.130.19.92",
    "sshPort": 22,
    "sshUser": "rescue",
    "sshPassword": "your-password",
    "workingDir": "/home/rescue"
  }'
```

## Daemon Modes

Boba Claude supports **2 execution modes**:

### 🔌 SSH Mode (Default)

Connect to Claude running on a **remote machine** via SSH:

```bash
cd apps/daemon
bun dev  # SSH mode
```

**Use cases:**
- Claude on a VPS or dedicated server
- Coder workspace on remote machine
- Multiple remote workspaces

### 🏠 Local Mode (Like Happy CLI)

Spawn Claude **locally** on the same machine as the daemon:

```bash
cd apps/daemon
bun run dev:local  # Local mode
```

**Use cases:**
- Development on Coder (daemon + Claude in same workspace)
- Local development with mobile/web access
- Expose local Claude via ngrok/Coder port forwarding

**Requirements:**
- Claude CLI installed (see installation below)
- No PostgreSQL database required (sessions stored in memory)

**Installing Claude CLI:**
```bash
# macOS/Linux
curl -fsSL https://claude.ai/install.sh | bash

# Windows
irm https://claude.ai/install.ps1 | iex
```

After installation, add to PATH:
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

## How It Works

### Session Persistence

**SSH Mode:**
- All messages (user + assistant) are automatically saved to PostgreSQL
- Sessions persist across page refreshes (even cmd+shift+R)
- Daemon restarts automatically restore sessions from DB

**Local Mode:**
- Sessions stored in memory only (no database required)
- Sessions lost on daemon restart
- Perfect for development and quick testing

### Message Flow

1. **Create Session:**
   - Frontend creates unique session ID
   - **SSH Mode:** Daemon establishes SSH connection to remote machine, saves to DB
   - **Local Mode:** Daemon verifies Claude CLI is installed locally, stores in memory

2. **Send Message:**
   - Frontend sends message with sessionId
   - Daemon builds full conversation context
   - **SSH Mode:** Executes via SSH: `ssh user@host "echo '<context>' | claude -p"`, saves to DB
   - **Local Mode:** Executes locally: `echo '<context>' | claude -p`, stores in memory
   - Returns response to frontend

3. **Multi-Session Support:**
   - Daemon manages multiple sessions in parallel
   - Each session has independent executor (SSH or Local)
   - Messages routed by sessionId
   - Switch between sessions without losing context

## Database Schema

```prisma
model Account {
  id           String      @id @default(cuid())
  publicKey    String      @unique
  sessions     Session[]
  workspaces   Workspace[]
}

model Session {
  id        String    @id @default(cuid())
  accountId String
  title     String    @default("New Chat")
  messages  Message[]
}

model Message {
  id        String   @id @default(cuid())
  sessionId String
  role      String   // 'user' | 'assistant'
  content   String
}

model Workspace {
  id          String  @id @default(cuid())
  accountId   String
  name        String
  sshHost     String
  sshPort     Int
  sshUser     String
  sshPassword String?
  workingDir  String
  isActive    Boolean @default(true)
}
```

## Authentication

### Phantom Wallet OAuth

1. User clicks "Connect with Phantom"
2. Signs message with wallet
3. API generates JWT token
4. Token stored in localStorage
5. WebSocket authenticates with token

## Debugging

### View Daemon Logs

```bash
cd apps/daemon
bun dev

# Look for:
# [Cloud Daemon] Session ready: session-1234
# [Cloud Daemon] Received message for session session-1234
```

### View Frontend Logs

Open browser console:
```
[Frontend] Socket.IO connected
[Frontend] Creating session: session-1234
[Frontend] Sending message for session session-1234
[Frontend] Received output for session session-1234
```

### Inspect Database

```bash
cd apps/api
bunx prisma studio  # Opens at http://localhost:5555
```

## Requirements

### Remote Machine

- Claude CLI installed (checked paths: `/usr/bin/claude`, `/usr/local/bin/claude`, `/home/rescue/.local/bin/claude`)
- SSH access (password or key-based)
- Working directory with proper permissions

### VPS/Local Machine

- Node.js 18+ or Bun
- PostgreSQL database
- SSH client
- SSH keys (auto-detected from `~/.ssh/id_ed25519`, `id_rsa`, `id_ecdsa`)

## Deployment

### Production Setup

1. **API Server:**
   ```bash
   cd apps/api
   bun run build
   bun start
   ```

2. **Cloud Daemon:**
   ```bash
   cd apps/daemon
   bun run build
   bun start
   ```

3. **Web App:**
   ```bash
   cd apps/web
   bun run build
   bun start
   ```

### Environment Variables (Production)

Update URLs to production domains:
- `API_URL`: Your API domain
- `NEXT_PUBLIC_API_URL`: Your API domain (public)
- `NEXT_PUBLIC_WS_URL`: Your WebSocket daemon domain
- `DATABASE_URL`: PostgreSQL connection string

## Project Structure

```
Boba-Claude/
├── apps/
│   ├── api/          # Fastify API (auth, sessions, workspaces)
│   │   ├── prisma/   # Database schema & migrations
│   │   └── src/
│   ├── daemon/       # Cloud daemon (SSH + Socket.IO)
│   │   └── src/
│   │       ├── cloud-daemon.ts   # Main daemon
│   │       └── ssh-executor.ts   # SSH client
│   ├── web/          # Next.js frontend
│   │   └── src/
│   └── cli/          # CLI tool (bonus)
└── README.md
```

## Contributing

1. Fork the repo
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open Pull Request

## License

MIT
