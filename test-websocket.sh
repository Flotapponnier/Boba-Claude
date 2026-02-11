#!/bin/bash

API_URL="http://localhost:4000"

# Login
echo "🔐 Logging in..."
TOKEN=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boba.com","password":"password123"}' | jq -r '.token')

# Create session
echo "🚀 Creating Claude session..."
SESSION_ID=$(curl -s -X POST "$API_URL/chat/session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.sessionId')

echo ""
echo "✅ Session ready: $SESSION_ID"
echo ""
echo "🌐 Connecting to WebSocket..."
echo "📝 Type your message and press Enter"
echo "   Try: {\"type\":\"message\",\"content\":\"Hello Claude, say hi in one sentence!\"}"
echo ""

# Connect with wscat
wscat -c "ws://localhost:4000/chat/stream/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN"
