# Boba Claude - Cloud Architecture (comme Happy)

Architecture centralisée permettant aux users de contrôler Claude sur leurs machines distantes via SSH, exactement comme Happy.

## 🏗️ Architecture Complète

```
User's Machine (Coder/Local)
  ↓ boba login (browser OAuth)
  ↓ boba init (configure SSH workspace)
  ↓ boba chat "build X"

VPS (Cloud Infrastructure)
├─ API (port 3002)
│  ├─ Auth & JWT
│  ├─ User accounts (guest/OAuth)
│  ├─ Workspace management
│  └─ Session management
│
├─ Cloud Daemon (port 3001)
│  ├─ WebSocket server
│  ├─ SSH connections to user machines
│  ├─ Claude process management
│  └─ Message routing
│
└─ Frontend (port 3000)
   └─ Web UI pour chat with Claude

User's Remote Machine (rescue@57.130.19.92:8822)
├─ Code du user
├─ Claude CLI installed
└─ SSH access depuis VPS
```

## 📁 Structure des Fichiers

### Base de données (Prisma)
```prisma
model Account {
  id           String         @id @default(cuid())
  username     String?
  claudeTokens ClaudeToken[]  // OAuth tokens Claude
  sessions     Session[]      // Chat sessions
  workspaces   Workspace[]    // SSH workspaces
}

model Workspace {
  id          String   @id
  accountId   String
  name        String
  sshHost     String   // e.g. "57.130.19.92"
  sshPort     Int      // e.g. 8822
  sshUser     String   // e.g. "rescue"
  sshPassword String?  // Encrypted
  workingDir  String   // e.g. "/home/rescue"
  isActive    Boolean
}
```

### API Routes
- `POST /api/auth/cli-request` - Initie browser OAuth
- `GET /api/auth/cli-poll/:id` - CLI poll pour token
- `POST /api/auth/cli-complete` - Frontend complète auth
- `POST /api/auth/guest` - Crée compte guest
- `GET /api/workspaces` - Liste workspaces
- `POST /api/workspaces` - Crée workspace
- `GET /api/workspaces/:userId/active` - Get active workspace

### Cloud Daemon (`apps/daemon/src/cloud-daemon.ts`)
- Écoute sur port 3001 (WebSocket)
- Authentifie users via JWT
- Fetch workspace config depuis API
- SSH vers machine distante
- Spawn Claude CLI sur machine distante
- Route messages bidirectionnels

### SSH Executor (`apps/daemon/src/ssh-executor.ts`)
- Connect SSH2
- Execute commandes distantes
- Stream Claude CLI stdin/stdout
- File operations (read/write)

### CLI Commands
- `boba login` - Browser OAuth flow
- `boba init` - Configure SSH workspace
- `boba chat "message"` - Chat avec Claude (cloud mode)
- `boba start` - Start local daemon (legacy mode)

## 🔄 Flow Complet

### 1. Setup Initial (une fois)
```bash
# User sur sa machine locale
boba login
# → Ouvre browser
# → Guest account créé
# → Token sauvé dans ~/.boba/token

boba init
# → Demande SSH config interactivement:
#    - Host: 57.130.19.92
#    - Port: 8822
#    - User: rescue
#    - Password: ****
#    - Working dir: /home/rescue
# → Crée workspace en DB (encrypted password)
```

### 2. Utilisation
```bash
boba chat "build a todo app"

# 1. CLI lit token depuis ~/.boba/token
# 2. CLI connect WebSocket au cloud daemon (port 3001)
# 3. Cloud daemon authentifie via API
# 4. Cloud daemon fetch workspace SSH config
# 5. Cloud daemon SSH vers 57.130.19.92:8822
# 6. Cloud daemon spawn: ssh rescue@57.130.19.92 -p 8822 'cd /home/rescue && claude'
# 7. Cloud daemon stream message → SSH → Claude
# 8. Claude répond → SSH → Cloud daemon → CLI
# 9. Output affiché dans terminal user
```

### 3. Frontend Web
```
User ouvre https://boba.vercel.app

1. Guest login ou OAuth
2. Connect WebSocket au cloud daemon
3. Cloud daemon utilise le workspace SSH configuré
4. Chat en temps réel avec Claude
5. Claude execute sur machine distante via SSH
```

## 🚀 Déploiement

### VPS (Hetzner/OVH/etc)
```bash
# Install dependencies
apt install postgresql nodejs npm

# Setup database
createdb boba_claude

# Clone repo
git clone <repo>
cd Boba-Claude

# Install deps
bun install

# Configure env
cp apps/api/.env.example apps/api/.env
# Edit .env with:
# - DATABASE_URL
# - JWT_SECRET
# - ENCRYPTION_KEY
# - FRONTEND_URL

# Run migrations
cd apps/api && bunx prisma migrate deploy

# Start services
pm2 start apps/api/src/index.ts --name boba-api
pm2 start apps/daemon/src/cloud-daemon.ts --name boba-daemon
pm2 start apps/web --name boba-frontend

# Setup nginx reverse proxy
# - api.boba.app → localhost:3002
# - ws.boba.app → localhost:3001
# - boba.app → localhost:3000
```

### Vercel (Frontend uniquement)
```bash
vercel --prod
# Auto-deploy apps/web
```

## 🔐 Sécurité

- **JWT tokens** pour auth
- **SSH passwords** encrypted avec ENCRYPTION_KEY
- **CORS** strict (localhost, Vercel)
- **SSH connections** ephemeral (per session)
- **No code upload** - Code reste sur machine user

## 🆚 Différences avec Architecture Locale

| Feature | Local Mode | Cloud Mode (Happy-like) |
|---------|-----------|------------------------|
| Daemon location | User's machine | VPS |
| Code location | User's machine | Remote via SSH |
| Setup | `boba start` | `boba init` (SSH config) |
| Usage | Frontend → Local daemon | CLI/Frontend → Cloud daemon → SSH |
| Scalability | 1 user | ∞ users |
| Mobility | Desktop only | Anywhere (phone, tablet) |

## 📝 Notes

- **SSH key support**: Pas encore implémenté, utilise password pour l'instant
- **Multiple workspaces**: User peut avoir plusieurs workspaces, un seul actif
- **Session persistence**: Sessions sauvées en DB, peuvent être resumed
- **Error handling**: Détecte si Claude CLI n'est pas installé sur remote

## 🔧 TODO pour Production

- [ ] Add SSH key support (au lieu de password)
- [ ] Rate limiting sur API
- [ ] Session timeout/cleanup
- [ ] Monitoring (Sentry, DataDog)
- [ ] Load balancing pour cloud daemon
- [ ] Auto-install Claude CLI sur remote si absent
- [ ] File upload/download via SSH
- [ ] Git integration (auto-clone repos)

## ✅ Implémenté

- [x] Schéma DB Workspace avec SSH config
- [x] SSH executor dans daemon
- [x] Cloud daemon avec SSH routing
- [x] API endpoints workspace management
- [x] CLI `boba init` pour config SSH
- [x] CLI `boba chat` qui hit cloud daemon
- [x] Browser OAuth flow pour login
- [x] Guest accounts
- [x] Encryption password SSH
- [x] Multi-workspace support
