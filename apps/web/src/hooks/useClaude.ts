'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useChatStore } from '@/lib/store'
import { io, Socket } from 'socket.io-client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

// Local-only mode - no user authentication needed
const LOCAL_TOKEN = 'local-session'

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

  const socketRef = useRef<Socket | null>(null)
  const { addMessage, setLoading } = useChatStore()

  // Connect to daemon (no OAuth needed in local mode)
  const connectClaude = async () => {
    try {
      setError(null)
      // Directly try to connect to daemon
      await createSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      console.error('Connect error:', err)
    }
  }

  // Connect to daemon session (daemon-only mode)
  const createSession = async () => {
    try {
      setIsConnecting(true)
      setError(null)

      // Get daemon session
      const daemonResponse = await fetch(`${API_URL}/chat/daemon-session`, {
        headers: {
          Authorization: `Bearer ${LOCAL_TOKEN}`,
        },
      })

      if (!daemonResponse.ok) {
        throw new Error('No daemon connected. Please start boba-daemon locally.')
      }

      const data = await daemonResponse.json()
      console.log('Found daemon session:', data.sessionId)
      setSessionId(data.sessionId)

      // Connect Socket.IO
      connectSocket(data.sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to daemon')
      setIsConnecting(false)
      console.error('Session creation error:', err)
    }
  }

  // Connect to Socket.IO
  const connectSocket = (sessionId: string) => {
    try {
      const socket = io(API_URL, {
        auth: {
          token: LOCAL_TOKEN,
          sessionId,
        },
        transports: ['websocket', 'polling'],
      })

      socket.on('connect', () => {
        console.log('Socket.IO connected')
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
      })

      socket.on('ready', (data) => {
        console.log('Session ready:', data)
      })

      socket.on('claude_message', (data) => {
        console.log('[Frontend] Received claude_message:', data)
        handleClaudeMessage({ type: 'claude_message', ...data })
      })

      socket.on('thinking', (data) => {
        handleClaudeMessage({ type: 'thinking', ...data })
      })

      socket.on('session_update', (data) => {
        handleClaudeMessage({ type: 'session_update', ...data })
      })

      socket.on('error', (data) => {
        console.error('Socket error:', data)
        setError(data.error || data.message || 'Socket error')
        setLoading(false)
      })

      socket.on('disconnect', () => {
        console.log('Socket.IO disconnected')
        setIsConnected(false)
        setIsConnecting(false)
      })

      socketRef.current = socket
    } catch (err) {
      console.error('Socket connection error:', err)
      setError('Failed to connect socket')
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
          console.log('[Frontend] Adding text message:', message.message.text)
          addMessage({
            role: 'assistant',
            content: message.message.text || message.content || '',
          })
          setLoading(false)
        } else if (message.tool) {
          // Handle tool execution
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
    if (!socketRef.current || !socketRef.current.connected) {
      setError('Not connected to Claude')
      return
    }

    try {
      socketRef.current.emit('message', {
        type: 'message',
        content,
      })
      setLoading(true)
    } catch (err) {
      console.error('Failed to send message:', err)
      setError('Failed to send message')
    }
  }, [setLoading])

  // Disconnect
  const disconnect = useCallback(async () => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    if (sessionId) {
      try {
        await fetch(`${API_URL}/chat/session/${sessionId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${LOCAL_TOKEN}`,
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
      if (socketRef.current) {
        socketRef.current.disconnect()
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
  }
}
