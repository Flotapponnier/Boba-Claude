# Boba Claude 🧋

Web-based interface for Claude AI with persistent sessions and resume support.

## What is Boba Claude?

Boba Claude lets you use Claude AI through a beautiful web interface while running Claude CLI on your local machine. All your conversations are preserved and can be resumed even after refreshing the page.

**Key Features:**
- 🎨 Beautiful web UI with customizable Boba characters
- 💾 Session persistence - never lose your conversations
- 🔄 Resume sessions from anywhere (web, terminal, VSCode)
- 🔐 Secure token-based authentication
- 🚀 Fast session creation using Happy CLI wrapper approach
- 🎭 Multiple chat sessions with independent contexts

## Architecture

```
Web Browser (Vercel)
       ↓
Cloud Relay (VPS)
       ↓
Your Daemon (Local/Coder)
       ↓
Claude CLI (Local)
```

**3 Components:**
1. **Web App** - Beautiful UI hosted on Vercel
2. **Cloud Relay** - Routes messages between frontends and daemons
3. **Local Daemon** - Runs on your machine, spawns Claude CLI processes

## Quick Start

### 1. Install Claude CLI

```bash
# macOS/Linux
curl -fsSL https://claude.ai/install.sh | bash

# Add to PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

### 2. Install Boba CLI

```bash
# Clone the repo
git clone https://github.com/Flotapponnier/Boba-Claude.git
cd Boba-Claude

# Install dependencies
bun install

# Install CLI globally (optional)
cd apps/cli
bun link
```

### 3. Start Your Daemon

```bash
# Login and get your token
boba login

# Start your personal daemon
boba start
```

You'll see:
```
🚀 Starting Boba daemon...
🔗 Connecting to relay: https://relay.boba-claude.com
👤 User ID: cmmn...
📂 Working directory: /Users/you/workspace

✨ Daemon running! Open the web app to use Claude:

   https://boba-claude.vercel.app

🔐 Authentication Token (copy this to the web app):

   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 4. Connect in Web App

1. Open https://boba-claude.vercel.app
2. Click "Connect Daemon"
3. Paste your authentication token
4. Start chatting! 🎉

## Features

### 🎨 Beautiful UI

- Customizable Boba characters (Black, Orange, Pink, Gold)
- Responsive design for desktop and mobile
- Markdown support in messages
- Real-time message streaming

### 💾 Session Management

**Create Sessions:**
- Click "New Chat" to start a new conversation
- Each session has independent context
- Sessions are saved automatically

**Session Persistence:**
- All messages are saved in localStorage
- Sessions persist across page refreshes
- Claude session ID displayed for easy access

**Resume Sessions:**
1. Copy the session ID from any active chat
2. Refresh the page or open in a new tab
3. Click "Resume Session"
4. Paste the session ID
5. Your conversation continues with full history!

### 🔄 Cross-Platform Resume

Resume your Claude sessions from **anywhere**:

**From Web:**
```
1. Copy session ID from web interface
2. Click "Resume Session"
3. Paste and continue
```

**From Terminal:**
```bash
claude --resume <session-id>
```

**From VSCode:**
```
Use Claude extension with session ID
```

### 🎭 Multiple Sessions

- Run multiple chat sessions in parallel
- Switch between sessions without losing context
- Each session has its own Claude CLI process
- Delete sessions when done (kills Claude process)

## CLI Commands

```bash
# Login and save credentials
boba login

# Start your daemon
boba start

# Open web interface
boba web

# Show current status
boba status
```

## Environment Variables

**For development:**

Create `.env` files if needed:

**apps/web/.env.local:**
```env
NEXT_PUBLIC_WS_URL=https://your-relay-url.com
```

**Cloud Relay (VPS):**
```env
API_URL=http://localhost:3002  # Optional API for verification
```

## How It Works

### Session Creation

1. Frontend creates unique session ID
2. Sends `create_session` to relay
3. Relay forwards to your daemon
4. Daemon spawns Claude CLI with Happy wrapper
5. Claude session ID captured and sent back to frontend
6. Frontend displays session ID for copying

### Message Flow

1. User types message in web UI
2. Frontend sends to relay with session ID
3. Relay routes to correct daemon (by user ID)
4. Daemon sends to Claude CLI process
5. Claude streams response back through relay
6. Frontend displays response in real-time

### Session Resume

1. User clicks "Resume Session" and pastes session ID
2. Frontend sends `create_session` with `resumeFrom` parameter
3. Daemon spawns Claude CLI with `--resume <session-id>`
4. Claude loads full conversation history
5. User continues where they left off

### Happy CLI Wrapper

Boba uses the Happy CLI wrapper approach to load Claude CLI in-process:

```javascript
// claude-wrapper.cjs - Loads Claude CLI directly
const claudePath = process.argv[2]
const mainModule = require.resolve(claudePath)
require(mainModule)
```

**Benefits:**
- ✅ Instant session creation (no spawn overhead)
- ✅ Direct process control
- ✅ Efficient message streaming
- ✅ Full Claude CLI compatibility

## Project Structure

```
Boba-Claude/
├── apps/
│   ├── cli/              # Boba CLI tool
│   │   └── src/
│   │       ├── index.ts           # CLI commands
│   │       └── daemon/
│   │           ├── daemon.ts       # Local daemon
│   │           ├── local-executor.ts  # Claude spawner
│   │           └── claude-wrapper.cjs # Happy CLI wrapper
│   ├── daemon/           # Cloud relay server
│   │   └── src/
│   │       ├── cloud-relay.ts     # WebSocket relay
│   │       └── local-executor.ts  # Same as CLI
│   └── web/              # Next.js frontend
│       └── src/
│           ├── app/page.tsx       # Main UI
│           ├── hooks/useClaude.ts # WebSocket hook
│           └── lib/store.ts       # State management
```

## Development

### Run Locally

**Terminal 1 - Cloud Relay:**
```bash
cd apps/daemon
bun run dev
```

**Terminal 2 - Web:**
```bash
cd apps/web
bun run dev
```

**Terminal 3 - Your Daemon:**
```bash
cd apps/cli
USER_AUTH_TOKEN="<your-token>" bun run daemon
```

### Deploy

**Web (Vercel):**
```bash
cd apps/web
vercel deploy
```

**Relay (VPS with PM2):**
```bash
cd apps/daemon
pm2 start "bun run dev" --name boba-relay
pm2 save
```

## Troubleshooting

### "No daemon connected"
- Make sure `boba start` is running
- Check the relay URL in web app settings
- Verify your token is correct

### "Claude CLI not found"
- Install Claude CLI: `curl -fsSL https://claude.ai/install.sh | bash`
- Add to PATH: `export PATH="$HOME/.local/bin:$PATH"`
- Restart terminal

### "Session ended with code 1"
- Check daemon logs for errors
- Verify Claude CLI is working: `claude --help`
- Ensure working directory exists and has permissions

### "Permission request failed"
- Daemon control server might not be running on port 3002
- Check if port is in use: `lsof -i :3002`
- Restart daemon with `boba start`

## Configuration

### Boba CLI Config

Config stored in `~/.boba/config.json`:
```json
{
  "token": "your-jwt-token",
  "userId": "your-user-id"
}
```

### Daemon Settings

Set environment variables:
```bash
export BOBA_RELAY_URL="https://your-relay.com"
export BOBA_WEB_URL="https://your-web.com"
export DEFAULT_WORKSPACE_DIR="/path/to/workspace"
```

## Security

- ✅ Token-based authentication (JWT)
- ✅ User isolation (each daemon only sees own sessions)
- ✅ No passwords stored (tokens only)
- ✅ Secure WebSocket connections
- ✅ Permission prompts for tool usage

## License

MIT

## Credits

- Inspired by [Happy CLI](https://github.com/cline/happy-cli) wrapper approach
- Built with [Claude](https://claude.ai)
- UI powered by Next.js and Tailwind CSS
