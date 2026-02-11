'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '@/lib/store'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://')

// Mock auth for development
const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwiaWF0IjoxNTE2MjM5MDIyfQ.mock'

interface ClaudeMessage {
  type: 'ready' | 'claude_message' | 'thinking' | 'session_update' | 'error' | 'output'
  content?: string
  message?: any
  isThinking?: boolean
  session?: any
  error?: string
}

export function useClaude() {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const { addMessage, setLoading } = useChatStore()

  // Check OAuth status
  const checkOAuthStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/oauth/status`, {
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      })
      const data = await response.json()
      return data.connected
    } catch (err) {
      console.error('Failed to check OAuth status:', err)
      return false
    }
  }

  // Start OAuth flow
  const connectClaude = async () => {
    try {
      setError(null)

      const response = await fetch(`${API_URL}/connect/claude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        throw new Error('Failed to start OAuth flow')
      }

      const data = await response.json()
      if (data.success) {
        // OAuth successful, create session
        await createSession()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      console.error('Connect error:', err)
    }
  }

  // Create Claude Code session
  const createSession = async () => {
    try {
      setIsConnecting(true)
      setError(null)

      const response = await fetch(`${API_URL}/chat/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create session')
      }

      const data = await response.json()
      setSessionId(data.sessionId)

      // Connect WebSocket
      connectWebSocket(data.sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
      setIsConnecting(false)
      console.error('Session creation error:', err)
    }
  }

  // Connect to WebSocket
  const connectWebSocket = (sessionId: string) => {
    try {
      const ws = new WebSocket(`${WS_URL}/chat/stream/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${MOCK_TOKEN}`,
        },
      } as any)

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
      }

      ws.onmessage = (event) => {
        try {
          const message: ClaudeMessage = JSON.parse(event.data)
          handleClaudeMessage(message)
        } catch (err) {
          console.error('Failed to parse message:', err)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('WebSocket connection error')
      }

      ws.onclose = () => {
        console.log('WebSocket closed')
        setIsConnected(false)
        setIsConnecting(false)
      }

      wsRef.current = ws
    } catch (err) {
      console.error('WebSocket connection error:', err)
      setError('Failed to connect WebSocket')
      setIsConnecting(false)
    }
  }

  // Handle messages from Claude
  const handleClaudeMessage = (message: ClaudeMessage) => {
    switch (message.type) {
      case 'ready':
        console.log('Session ready')
        break

      case 'claude_message':
        if (message.message?.type === 'text') {
          addMessage({
            role: 'assistant',
            content: message.message.text || message.content || '',
          })
          setLoading(false)
        }
        break

      case 'thinking':
        setLoading(message.isThinking || false)
        break

      case 'output':
        // Handle raw output from Claude CLI
        if (message.content) {
          console.log('Claude output:', message.content)
        }
        break

      case 'error':
        console.error('Claude error:', message.error)
        setError(message.error || 'An error occurred')
        setLoading(false)
        break

      default:
        console.log('Unknown message type:', message)
    }
  }

  // Send message to Claude
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to Claude')
      return
    }

    try {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        content,
      }))
      setLoading(true)
    } catch (err) {
      console.error('Failed to send message:', err)
      setError('Failed to send message')
    }
  }, [setLoading])

  // Disconnect
  const disconnect = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    if (sessionId) {
      try {
        await fetch(`${API_URL}/chat/session/${sessionId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${MOCK_TOKEN}`,
          },
        })
      } catch (err) {
        console.error('Failed to stop session:', err)
      }
    }

    setIsConnected(false)
    setSessionId(null)
  }, [sessionId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  return {
    isConnected,
    isConnecting,
    error,
    sessionId,
    connectClaude,
    disconnect,
    sendMessage,
    checkOAuthStatus,
  }
}
