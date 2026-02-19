#!/bin/bash
set -e

echo "🚀 Deploying Boba-Claude daemon to VPS..."

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git curl

# Install Claude CLI globally
echo "🤖 Installing Claude CLI..."
sudo npm install -g @anthropic-ai/claude-code

# Install PM2
echo "⚙️  Installing PM2..."
sudo npm install -g pm2

# Clone repo (or pull if exists)
REPO_URL="https://github.com/Flotapponnier/Boba-Claude.git"
APP_DIR="$HOME/boba-claude"

if [ -d "$APP_DIR" ]; then
  echo "📥 Pulling latest changes..."
  cd "$APP_DIR"
  git pull
else
  echo "📥 Cloning repository..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# Install daemon dependencies
echo "📦 Installing daemon dependencies..."
cd apps/daemon
npm install

# Build daemon
echo "🔨 Building daemon..."
npm run build

# Create .env file (ANTHROPIC_API_KEY required)
if [ ! -f ".env" ]; then
  echo "📝 Creating .env file..."
  echo "ANTHROPIC_API_KEY=your_api_key_here" > .env
  echo "⚠️  IMPORTANT: Edit apps/daemon/.env and add your ANTHROPIC_API_KEY"
fi

# Start with PM2
echo "🚀 Starting daemon with PM2..."
pm2 delete boba-daemon 2>/dev/null || true
pm2 start npm --name "boba-daemon" -- start
pm2 save
pm2 startup

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Edit ~/boba-claude/apps/daemon/.env and add your ANTHROPIC_API_KEY"
echo "2. Restart: pm2 restart boba-daemon"
echo "3. Check logs: pm2 logs boba-daemon"
echo "4. The daemon is now running on port 3001"
echo ""
echo "Access URL: http://57.130.19.92:3001"
