#!/bin/bash

echo "Testing Boba Claude Chat System"
echo "================================"
echo ""

# Login
echo "1. Login..."
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boba.com","password":"password123"}' \
  | jq -r '.token')

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to login"
  exit 1
fi

echo "✅ Logged in"
echo ""

# Check if token exists
echo "2. Checking Claude connection status..."
STATUS=$(curl -s http://localhost:4000/oauth/status \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.connected')

echo "Connected: $STATUS"
echo ""

if [ "$STATUS" = "false" ]; then
  echo "⚠️  No Claude API key configured."
  echo ""
  echo "To test chat, you need to save a Claude API key:"
  echo "1. Get a key from https://console.anthropic.com/settings/keys"
  echo "2. Run this command:"
  echo ""
  echo "   curl -X POST http://localhost:4000/dev/save-token \\"
  echo "     -H \"Authorization: Bearer $TOKEN\" \\"
  echo "     -H \"Content-Type: application/json\" \\"
  echo "     -d '{\"token\":\"YOUR-CLAUDE-API-KEY\"}'"
  echo ""
  echo "3. Then run this script again"
  exit 0
fi

echo "3. Sending test message to Claude..."
RESPONSE=$(curl -s -X POST http://localhost:4000/chat/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Say hello in one sentence"}
    ]
  }')

echo ""
echo "Response:"
echo "$RESPONSE" | jq '.'
echo ""

if echo "$RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
  echo "✅ Chat working!"
  echo ""
  echo "Claude said: $(echo "$RESPONSE" | jq -r '.message')"
else
  echo "❌ Chat failed"
  echo "Error: $(echo "$RESPONSE" | jq -r '.error')"
fi
