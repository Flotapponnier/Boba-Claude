#!/bin/bash

echo "Testing Boba Claude OAuth System"
echo "=================================="
echo ""

echo "1. Login to get JWT token..."
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boba.com","password":"password123"}' \
  | jq -r '.token')

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token. Is the server running?"
  exit 1
fi

echo "✅ Got JWT token: ${TOKEN:0:50}..."
echo ""

echo "2. Check OAuth status (should be disconnected)..."
STATUS=$(curl -s http://localhost:4000/oauth/status \
  -H "Authorization: Bearer $TOKEN")
echo "$STATUS"
echo ""

echo "3. To connect Claude, you need an API key from https://console.anthropic.com/settings/keys"
echo "   Then run:"
echo ""
echo "   curl -X POST http://localhost:4000/dev/save-token \\"
echo "     -H \"Authorization: Bearer $TOKEN\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"token\":\"YOUR-CLAUDE-API-KEY\"}'"
echo ""
