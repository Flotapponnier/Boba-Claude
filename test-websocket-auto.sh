#!/bin/bash

API_URL="http://localhost:4000"

# Login
echo "🔐 Logging in..."
TOKEN=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boba.com","password":"password123"}' | jq -r '.token')

# Create session
echo "🚀 Creating Claude session..."
SESSION_RESPONSE=$(curl -s -X POST "$API_URL/chat/session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.sessionId')

echo ""
echo "✅ Session ready: $SESSION_ID"
echo ""
echo "🌐 Testing WebSocket connection..."
echo ""

# Send test message via WebSocket with timeout
(
  echo '{"type":"message","content":"Say hello in one short sentence!"}'
  sleep 5
) | timeout 10 wscat -c "ws://localhost:4000/chat/stream/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "✅ WebSocket test complete!"
