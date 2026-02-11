#!/bin/bash
set -e

echo "🧋 Boba Claude - OAuth-Only Claude Code Test"
echo "=============================================="
echo ""

API_URL="http://localhost:4000"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Login
echo -e "${YELLOW}Step 1: Login${NC}"
TOKEN=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boba.com","password":"password123"}' | jq -r '.token')

if [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Logged in${NC}"
echo ""

# Check OAuth status
echo -e "${YELLOW}Step 2: Check OAuth Status${NC}"
STATUS=$(curl -s "$API_URL/oauth/status" -H "Authorization: Bearer $TOKEN" | jq -r '.connected')

if [ "$STATUS" = "false" ]; then
  echo -e "${RED}❌ Not connected to Claude. Run: ./test-oauth-flow.sh first${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Claude OAuth connected${NC}"
echo ""

# Create session
echo -e "${YELLOW}Step 3: Create Claude Code Session${NC}"
SESSION_RESPONSE=$(curl -s -X POST "$API_URL/chat/session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')

echo "$SESSION_RESPONSE" | jq '.'

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')

if [ "$SESSION_ID" = "null" ]; then
  echo -e "${RED}❌ Failed to create session${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Session created: $SESSION_ID${NC}"
echo ""
echo -e "${YELLOW}WebSocket URL: ws://localhost:4000/chat/stream/$SESSION_ID${NC}"
