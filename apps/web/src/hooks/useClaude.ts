'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useChatStore } from '@/lib/store'
import { io, Socket } from 'socket.io-client'
import { useBobaStore } from '@/lib/store'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'

interface ClaudeMessage {
  type: 'ready' | 'claude_message' | 'thinking' | 'session_update' | 'error' | 'output' | 'session_ready'
  sessionId?: string
  content?: string
  message?: any
  isThinking?: boolean
  session?: any
  error?: string
  tool?: any
}

export function useClaude() {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permissionRequest, setPermissionRequest] = useState<any>(null)
  const permissionQueueRef = useRef<any[]>([])
  const autoConnectRef = useRef(false)

  const socketRef = useRef<Socket | null>(null)
  const { addMessage, setLoading, wasConnected, setWasConnected } = useChatStore()

  // Connect to daemon directly via WebSocket
  const connectClaude = useCallback(async () => {
    try {
      setIsConnecting(true)
      setError(null)

      const socket = io(WS_URL, {
        transports: ['websocket'],
        timeout: 5000,
        reconnection: false,
      })

      // Set socketRef IMMEDIATELY before setting up handlers
      socketRef.current = socket

      socket.on('connect', () => {
        console.log('[Frontend] Socket.IO connected to multi-session daemon')
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        setWasConnected(true)

        // Auto-register all existing sessions so daemon re-attaches or spawns them
        const { sessions } = useChatStore.getState()
        const sessionIds = Object.keys(sessions)
        if (sessionIds.length > 0) {
          console.log('[Frontend] Re-registering existing sessions:', sessionIds)
          sessionIds.forEach((sid) => socket.emit('create_session', { sessionId: sid }))
        }
      })

      socket.on('connect_error', (err) => {
        console.error('[Frontend] Socket connection error:', err)
        setError('Failed to connect to daemon')
        setIsConnecting(false)
        setIsConnected(false)
      })

      // Session ready event - Claude process spawned for a session
      socket.on('session_ready', (data: { sessionId: string; claudeSessionId: string }) => {
        console.log(`[Frontend] Session ready: ${data.sessionId} (Claude ID: ${data.claudeSessionId})`)
      })

      // Session ended event - Claude process terminated
      socket.on('session_ended', (data: { sessionId: string; code: number }) => {
        console.log(`[Frontend] Session ended: ${data.sessionId} with code ${data.code}`)
      })

      socket.on('session_cancelled', (data: { sessionId: string }) => {
        console.log(`[Frontend] Session cancelled: ${data.sessionId}`)
        setLoading(data.sessionId, false)
      })

      // Claude messages (now includes sessionId)
      socket.on('claude_message', (data: ClaudeMessage) => {
        // Get current session ID from store directly (not from closure)
        const currentSession = useChatStore.getState().currentSessionId
        console.log(`[Frontend] Received claude_message for session ${data.sessionId}:`, data)
        console.log(`[Frontend] Current session ID is: ${currentSession}`)

        // Only process messages for current active session
        if (data.sessionId !== currentSession) {
          console.log(`[Frontend] Ignoring message for inactive session ${data.sessionId} (current: ${currentSession})`)
          return
        }

        handleClaudeMessage({ type: 'claude_message', ...data })
      })

      socket.on('thinking', (data) => {
        handleClaudeMessage({ type: 'thinking', ...data })
      })

      socket.on('session_update', (data) => {
        handleClaudeMessage({ type: 'session_update', ...data })
      })

      socket.on('permission_request', (data) => {
        console.log('[Frontend] Permission request:', data)
        permissionQueueRef.current.push(data)
        if (!permissionRequest) {
          setPermissionRequest(data)
        }
      })

      socket.on('error', (data) => {
        console.error('[Frontend] Socket error:', data)
        setError(data.error || data.message || 'Socket error')
        // Stop loading for the session that had the error
        if (data.sessionId) {
          setLoading(data.sessionId, false)
        }
      })

      socket.on('disconnect', () => {
        console.log('[Frontend] Socket.IO disconnected')
        setIsConnected(false)
        setIsConnecting(false)
      })

      // Timeout fallback
      setTimeout(() => {
        if (!socket.connected) {
          console.error('[Frontend] Connection timeout')
          setError('Connection timeout')
          setIsConnecting(false)
        }
      }, 5000)
    } catch (err) {
      console.error('[Frontend] Socket connection error:', err)
      setError('Failed to connect socket')
      setIsConnecting(false)
    }
  }, [setWasConnected, setLoading, permissionRequest])

  // Handle messages from Claude
  const handleClaudeMessage = (message: ClaudeMessage) => {
    switch (message.type) {
      case 'ready':
        console.log('[Frontend] Session ready')
        break

      case 'claude_message':
        if (message.message?.type === 'text') {
          console.log('[Frontend] Adding text message:', message.message.text)
          addMessage({
            role: 'assistant',
            content: message.message.text || message.content || '',
          })
          if (message.sessionId) {
            setLoading(message.sessionId, false)
          }
        } else if (message.tool) {
          console.log('[Frontend] Adding tool message:', message.tool.name)
          const toolInput = JSON.stringify(message.tool.input, null, 2)
          addMessage({
            role: 'tool',
            content: toolInput,
            toolName: message.tool.name,
            toolId: message.tool.id,
          })
        } else {
          console.log('[Frontend] Unknown message format:', message)
        }
        break

      case 'thinking':
        if (message.sessionId) {
          setLoading(message.sessionId, message.isThinking || false)
        }
        break

      case 'output':
        if (message.content) {
          console.log('[Frontend] Claude output:', message.content)
        }
        break

      case 'error':
        console.error('[Frontend] Claude error:', message.error)
        setError(message.error || 'An error occurred')
        if (message.sessionId) {
          setLoading(message.sessionId, false)
        }
        break

      default:
        console.log('[Frontend] Unknown message type:', message)
    }
  }

  // Create session - notify daemon to spawn Claude process
  const createSession = useCallback((sessionId: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.error('[Frontend] Cannot create session - not connected')
      setError('Not connected to daemon')
      return
    }

    console.log(`[Frontend] Creating session: ${sessionId}`)
    socketRef.current.emit('create_session', { sessionId })
  }, [])

  // Delete session - notify daemon to kill Claude process
  const deleteSession = useCallback((sessionId: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.error('[Frontend] Cannot delete session - not connected')
      return
    }

    console.log(`[Frontend] Deleting session: ${sessionId}`)
    socketRef.current.emit('delete_session', { sessionId })
  }, [])

  // Send message to Claude for specific session
  const sendMessage = useCallback((content: string, sessionId: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      setError('Not connected to Claude')
      return
    }

    if (!sessionId) {
      setError('No session ID provided')
      return
    }

    try {
      // Send message directly to daemon - no queueing needed
      // First message will trigger system/init, subsequent messages work normally
      console.log(`[Frontend] Sending message for session ${sessionId}:`, content)
      socketRef.current.emit('message', {
        sessionId,
        content,
      })
      setLoading(sessionId, true)
    } catch (err) {
      console.error('[Frontend] Failed to send message:', err)
      setError('Failed to send message')
    }
  }, [setLoading])

  // Send permission response
  const respondToPermission = useCallback((allowed: boolean) => {
    if (!socketRef.current || !permissionRequest) return

    socketRef.current.emit('permission_response', {
      requestId: permissionRequest.requestId,
      allowed,
    })

    permissionQueueRef.current = permissionQueueRef.current.filter(
      (req) => req.requestId !== permissionRequest.requestId
    )

    const nextRequest = permissionQueueRef.current[0] || null
    setPermissionRequest(nextRequest)
  }, [permissionRequest])

  // Cancel current operation for a session (kills and respawns Claude process)
  const cancelSession = useCallback((sessionId: string) => {
    if (!socketRef.current || !socketRef.current.connected) return
    console.log(`[Frontend] Cancelling session: ${sessionId}`)
    socketRef.current.emit('cancel_session', { sessionId })
  }, [])

  // Disconnect
  const disconnect = useCallback(async () => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    setIsConnected(false)
    setWasConnected(false)
  }, [setWasConnected])

  // Auto-reconnect disabled - user must manually connect each session
  // useEffect(() => {
  //   if (wasConnected && !autoConnectRef.current && !isConnected && !isConnecting) {
  //     autoConnectRef.current = true
  //     connectClaude()
  //   }
  // }, [wasConnected, isConnected, isConnecting, connectClaude])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  return {
    isConnected,
    isConnecting,
    error,
    permissionRequest,
    connectClaude,
    disconnect,
    createSession,
    deleteSession,
    cancelSession,
    sendMessage,
    respondToPermission,
  }
}
