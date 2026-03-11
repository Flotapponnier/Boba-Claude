'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { guestLogin, getClaudeLoginUrl, getClaudeStatus, disconnectClaude } from '@/lib/api'
import { LogIn, LogOut, User, Check, X } from 'lucide-react'

export function AuthButton() {
  const { authToken, setAuthToken, setUserId, logout } = useAuthStore()
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [claudeConnected, setClaudeConnected] = useState(false)
  const [checkingClaude, setCheckingClaude] = useState(false)

  // Check Claude connection status on mount and when auth token changes
  useEffect(() => {
    if (authToken) {
      setCheckingClaude(true)
      getClaudeStatus(authToken)
        .then((status) => {
          setClaudeConnected(status.connected)
        })
        .catch((err) => {
          console.error('Failed to check Claude status:', err)
        })
        .finally(() => {
          setCheckingClaude(false)
        })
    } else {
      setClaudeConnected(false)
    }
  }, [authToken])

  const handleGuestLogin = async () => {
    setIsLoggingIn(true)
    try {
      const data = await guestLogin()
      setAuthToken(data.token)
      setUserId(data.account.id)
    } catch (err) {
      console.error('Guest login failed:', err)
      alert('Failed to login')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleConnectClaude = async () => {
    if (!authToken) return

    try {
      const authUrl = await getClaudeLoginUrl(authToken)
      window.open(authUrl, '_blank', 'width=600,height=700')

      // Poll for connection status
      const interval = setInterval(async () => {
        try {
          const status = await getClaudeStatus(authToken)
          if (status.connected) {
            setClaudeConnected(true)
            clearInterval(interval)
          }
        } catch (err) {
          console.error('Failed to check status:', err)
        }
      }, 2000)

      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(interval), 300000)
    } catch (err) {
      console.error('Failed to get Claude login URL:', err)
      alert('Failed to initiate Claude login')
    }
  }

  const handleDisconnectClaude = async () => {
    if (!authToken) return

    try {
      await disconnectClaude(authToken)
      setClaudeConnected(false)
    } catch (err) {
      console.error('Failed to disconnect Claude:', err)
      alert('Failed to disconnect Claude')
    }
  }

  const handleLogout = () => {
    logout()
    setClaudeConnected(false)
  }

  if (!authToken) {
    return (
      <button
        onClick={handleGuestLogin}
        disabled={isLoggingIn}
        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
      >
        <LogIn size={20} />
        {isLoggingIn ? 'Logging in...' : 'Guest Login'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Claude Status */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
        {checkingClaude ? (
          <div className="text-gray-400 text-sm">Checking...</div>
        ) : claudeConnected ? (
          <>
            <Check size={16} className="text-green-500" />
            <span className="text-green-400 text-sm">Claude Connected</span>
            <button
              onClick={handleDisconnectClaude}
              className="ml-2 text-xs text-gray-400 hover:text-red-400"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <X size={16} className="text-red-500" />
            <button
              onClick={handleConnectClaude}
              className="text-sm text-orange-400 hover:text-orange-300"
            >
              Connect Claude
            </button>
          </>
        )}
      </div>

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
      >
        <LogOut size={16} />
      </button>
    </div>
  )
}
