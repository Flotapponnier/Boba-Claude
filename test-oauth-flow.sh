#!/bin/bash

echo "Testing Full OAuth Flow with Claude.ai"
echo "======================================="
echo ""

# Login
echo "1. Login to Boba Claude..."
RESPONSE=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boba.com","password":"password123"}')

TOKEN=$(echo "$RESPONSE" | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Failed to login"
  echo "$RESPONSE"
  exit 1
fi

echo "✅ Logged in"
echo ""

# Check current status
echo "2. Checking current connection status..."
STATUS=$(curl -s http://localhost:4000/oauth/status \
  -H "Authorization: Bearer $TOKEN")

echo "$STATUS" | jq '.'
CONNECTED=$(echo "$STATUS" | jq -r '.connected')

if [ "$CONNECTED" = "true" ]; then
  echo ""
  echo "✅ Already connected to Claude!"
  echo ""
  echo "To test disconnection and reconnection:"
  echo "  curl -X DELETE http://localhost:4000/oauth/disconnect \\"
  echo "    -H \"Authorization: Bearer $TOKEN\""
  exit 0
fi

echo ""
echo "3. Starting OAuth flow (will open browser)..."
echo ""
echo "📋 Steps:"
echo "  1. Browser will open to Claude.ai"
echo "  2. Login to Claude.ai if needed"
echo "  3. Click 'Authorize' to give Boba Claude access"
echo "  4. You'll be redirected back to localhost:4000"
echo "  5. Check connection status again"
echo ""
read -p "Press Enter to start OAuth flow..."

CONNECT_RESPONSE=$(curl -s -X POST http://localhost:4000/connect/claude \
  -H "Authorization: Bearer $TOKEN")

echo ""
echo "$CONNECT_RESPONSE" | jq '.'
echo ""

# Wait for user to complete OAuth
echo "⏳ Complete the authorization in your browser..."
echo ""
echo "After authorizing, press Enter to check connection status..."
read

# Check status again
echo ""
echo "4. Checking connection status after OAuth..."
STATUS=$(curl -s http://localhost:4000/oauth/status \
  -H "Authorization: Bearer $TOKEN")

echo "$STATUS" | jq '.'
CONNECTED=$(echo "$STATUS" | jq -r '.connected')

if [ "$CONNECTED" = "true" ]; then
  echo ""
  echo "✅ Successfully connected to Claude!"
  echo ""
  echo "Now you can test chat:"
  echo "  ./test-chat.sh"
else
  echo ""
  echo "❌ Not connected yet"
  echo ""
  echo "Possible issues:"
  echo "  - OAuth flow not completed"
  echo "  - Browser didn't redirect properly"
  echo "  - Check the API logs for errors"
fi
