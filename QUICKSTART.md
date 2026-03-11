# Quick Start Guide

## Test rapide sans OAuth

### 1. Setup Database

```bash
# Créer la database
createdb boba_claude

# Ou via psql
psql postgres -c "CREATE DATABASE boba_claude;"
```

### 2. Configure API

```bash
cd apps/api
cp .env.example .env
```

Édite `.env` - **OAuth credentials sont optionnels** :

```env
DATABASE_URL="postgresql://localhost:5432/boba_claude"
JWT_SECRET="dev-secret-key"
ENCRYPTION_KEY="dev-encryption-key-32-bytes-ok"
FRONTEND_URL="http://localhost:3000"
PORT=3002

# OAuth optionnel - laisse vide pour utiliser ton auth Claude système
CLAUDE_CLIENT_ID=""
CLAUDE_CLIENT_SECRET=""
CLAUDE_REDIRECT_URI="http://localhost:3002/api/auth/claude-callback"
```

### 3. Run migrations

```bash
cd apps/api
pnpm prisma migrate dev --name init
```

### 4. Start tout

```bash
# Depuis la racine
pnpm dev
```

Ça va lancer :
- API sur :3002
- Daemon sur :3001
- Frontend sur :3000

### 5. Test !

1. Ouvre http://localhost:3000
2. Clique **"Guest Login"**
3. Tu as maintenant un JWT token
4. Le bouton "Connect Claude" sera disabled (pas d'OAuth configuré)
5. **Mais tu peux quand même chatter !** → Il utilisera ton auth Claude système de `~/.claude/`

## Mode avec OAuth (Optionnel)

Si tu veux tester l'OAuth multi-tenant complet :

1. Va sur https://console.anthropic.com
2. Settings → OAuth Applications
3. Create app avec redirect `http://localhost:3002/api/auth/claude-callback`
4. Copie Client ID + Secret dans `apps/api/.env`
5. Redémarre l'API
6. Le bouton "Connect Claude" sera maintenant actif

## Comment ça marche

**Sans OAuth** (mode dev) :
- Guest login → JWT token
- WebSocket auth avec JWT
- Daemon utilise le Claude auth système (partagé entre users)

**Avec OAuth** (prod) :
- Guest login → JWT token
- Connect Claude → OAuth flow → Token encrypted in DB
- WebSocket auth avec JWT
- Daemon fetch le token user-specific depuis l'API
- Chaque user a son propre token Claude isolé

## Troubleshooting

**"Authentication required"**
→ Clique "Guest Login" d'abord

**Daemon ne se connecte pas**
→ Vérifie que l'API tourne sur :3002

**Postgres connection error**
→ Vérifie DATABASE_URL et que postgres tourne

**Claude CLI not found**
→ `npm install -g @anthropic/claude-cli`
