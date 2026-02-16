'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useChatStore } from '@/lib/store'
import { io, Socket } from 'socket.io-client'
import { useBobaStore } from '@/lib/store'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'

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
  const [permissionRequest, setPermissionRequest] = useState<any>(null)
  const permissionQueueRef = useRef<any[]>([])
  const autoConnectRef = useRef(false)

  const socketRef = useRef<Socket | null>(null)
  const { addMessage, setLoading, wasConnected, setWasConnected } = useChatStore()

  // Connect to daemon directly via WebSocket
  const connectClaude = async () => {
    try {
      setIsConnecting(true)
      setError(null)

      const socket = io(WS_URL, {
        transports: ['websocket', 'polling'],
      })

      socket.on('connect', () => {
        console.log('Socket.IO connected')
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        setWasConnected(true)
      })

      socket.on('ready', (data) => {
        console.log('Session ready:', data)
        setSessionId(data.sessionId)
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

      socket.on('permission_request', (data) => {
        console.log('[Frontend] Permission request:', data)
        permissionQueueRef.current.push(data)
        // Show first in queue if no modal is currently open
        if (!permissionRequest) {
          setPermissionRequest(data)
        }
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

  // Send permission response
  const respondToPermission = useCallback((allowed: boolean) => {
    if (!socketRef.current || !permissionRequest) return

    socketRef.current.emit('permission_response', {
      requestId: permissionRequest.requestId,
      allowed,
    })

    // Remove current from queue
    permissionQueueRef.current = permissionQueueRef.current.filter(
      (req) => req.requestId !== permissionRequest.requestId
    )

    // Show next in queue, or null if queue is empty
    const nextRequest = permissionQueueRef.current[0] || null
    setPermissionRequest(nextRequest)
  }, [permissionRequest])

  // Disconnect
  const disconnect = useCallback(async () => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    setIsConnected(false)
    setSessionId(null)
    setWasConnected(false)
  }, [setWasConnected])

  // Auto-reconnect on mount if was previously connected
  useEffect(() => {
    if (wasConnected && !autoConnectRef.current && !isConnected && !isConnecting) {
      autoConnectRef.current = true
      connectClaude()
    }
  }, [wasConnected, isConnected, isConnecting, connectClaude])

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
    permissionRequest,
    connectClaude,
    disconnect,
    sendMessage,
    respondToPermission,
  }
}
