#!/bin/bash

set -e

echo "🧋 Boba Claude - Full Claude Code Integration Test"
echo "=================================================="
echo ""

API_URL="http://localhost:4000"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Login${NC}"
echo "Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boba.com","password":"password123"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo $LOGIN_RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Logged in successfully${NC}"
echo ""

echo -e "${YELLOW}Step 2: Save API Key${NC}"
echo "Please enter your Claude API key (starts with sk-ant-):"
read -s API_KEY

if [[ ! $API_KEY =~ ^sk-ant- ]]; then
  echo -e "${RED}❌ Invalid API key format${NC}"
  exit 1
fi

API_KEY_RESPONSE=$(curl -s -X POST $API_URL/connect/api-key \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\":\"$API_KEY\"}")

if echo $API_KEY_RESPONSE | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✅ API key saved${NC}"
else
  echo -e "${RED}❌ Failed to save API key${NC}"
  echo $API_KEY_RESPONSE | jq '.'
  exit 1
fi
echo ""

echo -e "${YELLOW}Step 3: Create Claude Session${NC}"
echo "Creating new Claude Code session..."
SESSION_RESPONSE=$(curl -s -X POST $API_URL/chat/session \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')

SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.sessionId')

if [ "$SESSION_ID" = "null" ] || [ -z "$SESSION_ID" ]; then
  echo -e "${RED}❌ Failed to create session${NC}"
  echo $SESSION_RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Session created: $SESSION_ID${NC}"
echo ""

echo -e "${YELLOW}Step 4: Connect to WebSocket${NC}"
echo "WebSocket URL: ws://localhost:4000/chat/stream/$SESSION_ID"
echo "Authorization: Bearer $TOKEN"
echo ""
echo "To test the WebSocket connection, you can use a tool like wscat:"
echo ""
echo "  npm install -g wscat"
echo "  wscat -c 'ws://localhost:4000/chat/stream/$SESSION_ID' \\"
echo "    -H 'Authorization: Bearer $TOKEN'"
echo ""
echo "Then send a message:"
echo '  {"type":"message","content":"Hello Claude!"}'
echo ""

echo -e "${YELLOW}Step 5: Get Session Info${NC}"
SESSION_INFO=$(curl -s -X GET "$API_URL/chat/session/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "Session Info:"
echo $SESSION_INFO | jq '.'
echo ""

echo -e "${GREEN}✅ Full flow test completed!${NC}"
echo ""
echo "Next steps:"
echo "1. Install Claude CLI: https://docs.anthropic.com/claude/docs/claude-cli"
echo "2. Connect via WebSocket and send messages"
echo "3. Check ~/.config/claude-cli/sessions/$SESSION_ID.jsonl for session logs"
