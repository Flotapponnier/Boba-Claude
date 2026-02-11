# OAuth Flow with Claude.ai

Boba Claude uses the official Claude.ai OAuth flow (same as Happy.engineering) to securely connect to your Claude account.

## How it works

1. **Client ID**: We use Claude Code CLI's public client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
2. **PKCE Flow**: Proof Key for Code Exchange ensures security without client secret
3. **Callback**: After authorization, Claude.ai redirects to `http://localhost:4000/oauth/callback`
4. **Token Storage**: Access tokens are encrypted with AES-256-GCM and stored in SQLite

## Testing the OAuth Flow

### Terminal Flow

Run the interactive OAuth test:

```bash
./test-oauth-flow.sh
```

This will:
1. Login to Boba Claude
2. Open your browser to Claude.ai
3. Prompt you to authorize access
4. Redirect back to the app
5. Verify the connection

### Manual Flow

```bash
# 1. Login to get JWT
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boba.com","password":"password123"}' \
  | jq -r '.token')

# 2. Start OAuth flow (opens browser)
curl -X POST http://localhost:4000/connect/claude \
  -H "Authorization: Bearer $TOKEN"

# 3. Authorize in browser (opens automatically)
# Click "Authorize" on Claude.ai

# 4. Check connection status
curl http://localhost:4000/oauth/status \
  -H "Authorization: Bearer $TOKEN"
# Should return: {"connected": true}

# 5. Test chat
./test-chat.sh
```

## OAuth Endpoints

### Start OAuth Flow
```bash
POST /connect/claude
Authorization: Bearer <JWT>
```

Opens browser to Claude.ai authorization page.

### OAuth Callback
```bash
GET /oauth/callback?code=<CODE>&state=<STATE>
```

Handles the redirect from Claude.ai, exchanges code for access token, and stores it encrypted.

### Check Connection Status
```bash
GET /oauth/status
Authorization: Bearer <JWT>
```

Returns `{"connected": true/false}`

### Disconnect
```bash
DELETE /oauth/disconnect
Authorization: Bearer <JWT>
```

Removes the stored Claude token.

## Security

- **PKCE**: Challenge/verifier prevents authorization code interception
- **State Parameter**: Prevents CSRF attacks
- **Encryption**: Tokens encrypted with AES-256-GCM before storage
- **5-minute TTL**: PKCE sessions expire after 5 minutes
- **JWT Auth**: All endpoints require valid JWT token

## Troubleshooting

**Browser doesn't open:**
- Manually visit the URL shown in the response
- Copy/paste into your browser

**Callback redirect fails:**
- Make sure API server is running on port 4000
- Check that no firewall is blocking localhost:4000

**"Invalid state" error:**
- The OAuth session expired (5 min TTL)
- Start the flow again with `/connect/claude`

**Token not saved:**
- Check API logs for errors
- Verify the callback URL in browser address bar
- Make sure the code exchange succeeded
