<div align="center">
  <img src="./public/banner.png" alt="Boba Claude Banner" width="600"/>
</div>

# Boba Claude

A multi-session web interface for Claude Code CLI, featuring persistent conversation history, real-time communication, and tool execution permission management.

## Overview

Boba Claude provides a browser-based interface to interact with multiple Claude Code CLI instances simultaneously. Each chat session spawns its own Claude CLI process, enabling parallel conversations with full tool usage capabilities and permission management through hooks.

## Core Features

- **Multi-Session Support**: Run multiple Claude CLI processes simultaneously, one per chat session
- **Persistent Memory**: Full conversation history stored in browser localStorage
- **Session Management**: Create, rename, delete, and switch between AI conversations
- **Real-time Communication**: WebSocket-based bidirectional streaming with Socket.IO
- **Tool Permission System**: Interactive permission requests via Claude Code hooks
- **Per-Session Loading States**: Visual feedback isolated to each active session
- **Character Themes**: Customizable boba character themes (black, orange, pink, gold)

## Architecture

### Technology Stack

**Frontend (Next.js 14+)**
- React 18 with App Router
- TypeScript for type safety
- Tailwind CSS for responsive design
- Zustand for state management with localStorage persistence
- Socket.io client for real-time bidirectional communication

**Daemon (Node.js)**
- Socket.io server for WebSocket connections
- Multi-session process manager (Map<sessionId, ClaudeProcess>)
- Claude CLI spawner with SDK mode (--input-format stream-json --output-format stream-json)
- Hook server for permission requests

**Permission System**
- API server (Express) handling permission requests via hooks
- PreToolUse hooks configured in Claude CLI settings
- Interactive UI for approving/denying tool executions

### Project Structure

```
boba-claude/
├── apps/
│   ├── web/              # Next.js frontend application
│   │   ├── src/
│   │   │   ├── app/      # Next.js app router (page.tsx)
│   │   │   ├── components/ # UI components
│   │   │   ├── hooks/    # useClaude.ts (Socket.IO + session management)
│   │   │   └── lib/      # store.ts (Zustand state management)
│   │   └── public/       # Static assets (boba character images)
│   ├── daemon/           # Multi-session Claude CLI manager
│   │   ├── src/
│   │   │   ├── index.ts       # Socket.IO server + session router
│   │   │   └── claude-spawner.ts # Claude CLI process spawner
│   │   └── .claude/      # Claude CLI settings (hooks config)
│   └── api/              # Permission server
│       └── src/
│           └── index.ts  # Express server for hook permission requests
└── public/
    └── assets/
        └── branding/     # Boba character PNGs (black, orange, pink, gold)
```

### How It Works

1. **Frontend → Daemon**: User sends message via Socket.IO to daemon
2. **Daemon**: Routes message to corresponding Claude CLI process (one per session)
3. **Claude CLI**: Processes message, triggers PreToolUse hook before each tool
4. **Hook → API**: Hook sends permission request to API server via curl
5. **API → Frontend**: Permission request forwarded to browser via Socket.IO
6. **User Decision**: User approves/denies in UI
7. **Permission Response**: Flows back through API → Hook → Claude CLI
8. **Claude Response**: Sent back through Daemon → Frontend

## Security Features

- **Anthropic API Key**: Stored in environment variables, never exposed to frontend
- **Interactive Permission System**: User must approve each tool execution via hooks
- **Session Isolation**: Each chat runs in its own Claude CLI process
- **localStorage Only**: No backend database, all data stored client-side
- **Process Cleanup**: Daemon automatically kills Claude processes when sessions are deleted

## Prerequisites

- Node.js 20+
- Claude Code CLI installed and authenticated (`claude auth login`)
- npm or pnpm

## Environment Variables

```env
# Frontend (.env.local in apps/web/)
NEXT_PUBLIC_WS_URL=http://localhost:3001  # Daemon WebSocket URL

# Daemon (optional, uses defaults)
DAEMON_PORT=3001                          # Socket.IO server port
PERMISSION_SERVER_PORT=3002               # Permission hook server port

# API (optional)
API_PORT=4000                             # Permission server port
```

## Local Development

```bash
# Install dependencies
npm install

# Terminal 1: Start permission API server
cd apps/api && npm run dev

# Terminal 2: Start daemon (Claude CLI manager)
cd apps/daemon && npm run dev

# Terminal 3: Start web frontend
cd apps/web && npm run dev

# Open browser at http://localhost:3000
```

### Development Workflow

1. Click "Connect to Claude" to establish WebSocket connection
2. Create a new session (spawns a Claude CLI process)
3. Send messages - Claude will request permissions via hooks
4. Approve/deny each tool execution in the UI
5. Switch between sessions to run multiple conversations
6. Delete sessions to clean up Claude processes

## Roadmap

### ✅ Phase 1: Multi-Session Support (Complete)
- Multi-session architecture with independent Claude CLI processes
- Socket.IO bidirectional communication
- Per-session loading states
- Session lifecycle management (create, delete, switch)
- localStorage persistence

### ✅ Phase 2: Permission System (Complete)
- PreToolUse hooks integration
- Interactive permission approval UI
- Permission request forwarding via API server
- Hook-based security layer

### 🚧 Phase 3: UX Improvements (In Progress)
- Cancel button for stuck loading states
- Better error handling and user feedback
- Session renaming functionality
- Message search within sessions

### 📋 Phase 4: Enhanced Features (Planned)
- File upload support for Claude context
- Code execution output display
- Session export/import
- Keyboard shortcuts
- Mobile-responsive improvements

## Technical Notes

### Why Multi-Session?
Each chat session spawns its own Claude CLI process to:
- Enable parallel conversations without context mixing
- Isolate tool permissions per session
- Allow independent process management
- Prevent session interference

### Why Hooks?
Claude Code hooks provide:
- Fine-grained control over tool execution
- Interactive approval workflow
- Security boundary between Claude and system
- Flexibility to customize permission logic

## Contributing

This is a private project for Mobula internal use. For questions or suggestions, contact the development team.

## License

Proprietary - All rights reserved
