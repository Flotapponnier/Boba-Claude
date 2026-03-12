# Boba CLI

CLI tool to start your personal Boba Claude daemon.

## Installation

```bash
# From root directory
bun install
cd apps/cli
bun install
```

## Usage

```bash
# Start your personal daemon
boba start

# The daemon will:
# 1. Ask you to login with Phantom wallet (if not already logged in)
# 2. Connect to the relay server
# 3. Start accepting Claude sessions in your current workspace
```

## How it works

1. **First time**: CLI opens browser to login with Phantom → saves JWT token locally
2. **Subsequent runs**: Uses saved token to connect daemon to relay
3. **Relay routes**: Your frontend connections are routed to YOUR daemon only
4. **Isolation**: Your Claude sessions have access to YOUR code in YOUR workspace

## Environment Variables

- `BOBA_RELAY_URL`: Relay server URL (default: `http://localhost:3001`)
- `BOBA_API_URL`: API server URL (default: `http://localhost:3002`)
