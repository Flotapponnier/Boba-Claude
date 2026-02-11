'use client'

import { useState, useEffect } from 'react'
import { useChatStore, useBobaStore } from '@/lib/store'
import { useClaude } from '@/hooks/useClaude'
import Image from 'next/image'
import { Settings, Send, MessageSquare, Clock, Plug, PlugZap } from 'lucide-react'

const CHARACTER_IMAGES = {
  black: '/assets/branding/black_boba.png',
  orange: '/assets/branding/boba.png',
  pink: '/assets/branding/pinky_boba.png',
  gold: '/assets/branding/golden_boba.png',
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [input, setInput] = useState('')
  const { messages, isLoading, addMessage } = useChatStore()
  const { character } = useBobaStore()
  const { isConnected, isConnecting, error, connectClaude, disconnect, sendMessage } = useClaude()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSendMessage = async () => {
    if (!input.trim() || !isConnected) return

    // Add user message to UI
    addMessage({ role: 'user', content: input })

    // Send via WebSocket
    sendMessage(input)
    setInput('')
  }

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="relative w-32 h-32">
          <Image
            src="/assets/branding/boba.png"
            alt="Loading..."
            fill
            className="object-contain animate-rotate-slow"
            unoptimized
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <div
        className="w-64 border-r flex flex-col"
        style={{ borderColor: 'var(--bg-secondary)', backgroundColor: character === 'black' ? '#ffffff' : 'var(--bg-primary)' }}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--bg-secondary)' }}>
          <div className="relative w-full h-24 mb-3">
            <Image
              src="/banner.png"
              alt="Boba Claude"
              fill
              className="object-contain"
              unoptimized
              priority
            />
          </div>
          {/* Connection Status & Button */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 justify-center">
              <div
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span
                className="text-xs font-medium"
                style={{ color: character === 'black' ? '#666666' : 'var(--text-secondary)' }}
              >
                {isConnecting ? 'Connecting...' : isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* Connect/Disconnect Button */}
            <button
              onClick={isConnected ? disconnect : connectClaude}
              disabled={isConnecting}
              className="w-full flex items-center gap-2 justify-center p-2 rounded-lg transition-all hover:scale-105 disabled:opacity-50"
              style={{
                backgroundColor: isConnected ? '#ef4444' : 'var(--accent)',
                color: '#ffffff',
              }}
            >
              {isConnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Connecting...</span>
                </>
              ) : isConnected ? (
                <>
                  <PlugZap size={16} />
                  <span className="text-sm font-medium">Disconnect</span>
                </>
              ) : (
                <>
                  <Plug size={16} />
                  <span className="text-sm font-medium">Connect Claude</span>
                </>
              )}
            </button>

            {/* Error Display */}
            {error && (
              <div className="p-2 rounded-lg bg-red-100 text-red-600 text-xs text-center">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 p-4 space-y-2">
          <button
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-opacity-10 hover:bg-black transition-colors"
            style={{ color: character === 'black' ? '#000000' : 'var(--text-primary)' }}
          >
            <MessageSquare size={20} />
            <span>New Chat</span>
          </button>

          <div className="pt-4">
            <p className="text-xs font-medium mb-2" style={{ color: character === 'black' ? '#666666' : 'var(--text-secondary)' }}>
              HISTORY
            </p>
            <div className="space-y-1">
              <button
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-opacity-10 hover:bg-black transition-colors text-left"
                style={{ color: character === 'black' ? '#666666' : 'var(--text-secondary)' }}
              >
                <Clock size={16} />
                <span className="text-sm truncate">Previous conversation...</span>
              </button>
            </div>
          </div>
        </div>

        {/* Settings Button */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--bg-secondary)' }}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-opacity-10 hover:bg-black transition-colors"
            style={{ color: character === 'black' ? '#000000' : 'var(--text-primary)' }}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col" style={{ backgroundColor: character === 'black' ? '#ffffff' : 'var(--bg-primary)' }}>
          {/* Settings Modal */}
        {showSettings && (
          <SettingsModal onClose={() => setShowSettings(false)} />
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 max-w-4xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="relative w-32 h-32 mb-4 animate-float">
                <Image
                  src={CHARACTER_IMAGES[character]}
                  alt="Boba"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
                Start your Boba Claude session !
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="relative w-12 h-12 mr-2 flex-shrink-0">
                    <Image
                      src={CHARACTER_IMAGES[character]}
                      alt="Boba"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                )}
                <div
                  className={`max-w-[70%] p-3 rounded-2xl ${
                    message.role === 'user'
                      ? 'rounded-br-none'
                      : 'rounded-bl-none'
                  }`}
                  style={{
                    backgroundColor: message.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: message.role === 'user' ? '#ffffff' : 'var(--text-primary)',
                  }}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex justify-start items-center">
              <div className="relative w-16 h-16 mr-3">
                {/* Rotating dots around boba */}
                <div className="absolute inset-0 animate-spin-slow">
                  <div className="absolute w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)', top: '8%', left: '50%', transform: 'translateX(-50%)' }}></div>
                  <div className="absolute w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--accent)', top: '18%', left: '75%' }}></div>
                  <div className="absolute w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)', top: '50%', left: '90%', transform: 'translateY(-50%)' }}></div>
                  <div className="absolute w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--accent)', top: '75%', left: '80%' }}></div>
                  <div className="absolute w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)', top: '92%', left: '50%', transform: 'translateX(-50%)' }}></div>
                  <div className="absolute w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--accent)', top: '80%', left: '18%' }}></div>
                  <div className="absolute w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)', top: '50%', left: '5%', transform: 'translateY(-50%)' }}></div>
                  <div className="absolute w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--accent)', top: '22%', left: '15%' }}></div>
                </div>
                {/* Boba character rotating */}
                <div className="absolute inset-2">
                  <Image
                    src={CHARACTER_IMAGES[character]}
                    alt="Boba"
                    fill
                    className="object-contain animate-rotate-slow"
                    unoptimized
                  />
                </div>
              </div>
              <div
                className="flex items-center p-3 rounded-2xl rounded-bl-none"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="flex space-x-1">
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 border-t max-w-4xl mx-auto w-full" style={{ borderColor: 'var(--bg-secondary)' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={isConnected ? "Type a message..." : "Connect Claude to start chatting..."}
              className="flex-1 p-3 rounded-xl outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
              disabled={isLoading || !isConnected}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim() || !isConnected}
              className="p-3 rounded-xl disabled:opacity-50 transition-all hover:scale-105"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Send size={20} color="#ffffff" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { character, setCharacter } = useBobaStore()

  const characters = [
    { id: 'black' as const, name: 'Black Boba', image: CHARACTER_IMAGES.black },
    { id: 'orange' as const, name: 'Orange Boba', image: CHARACTER_IMAGES.orange },
    { id: 'pink' as const, name: 'Pinky Boba', image: CHARACTER_IMAGES.pink },
    { id: 'gold' as const, name: 'Golden Boba', image: CHARACTER_IMAGES.gold },
  ]

  const themeBgColors = {
    black: '#f5f5f5',
    orange: '#ffe4d6',
    pink: '#ffe0eb',
    gold: '#fff4d6',
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 max-w-md w-full"
        style={{ backgroundColor: '#ffffff' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-6" style={{ color: '#000000' }}>
          Choose Your Boba
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {characters.map((char) => (
            <button
              key={char.id}
              onClick={() => {
                setCharacter(char.id)
                onClose()
              }}
              className={`p-4 rounded-xl transition-all hover:scale-105 ${
                character === char.id ? 'ring-4 ring-gray-400' : ''
              }`}
              style={{
                backgroundColor: themeBgColors[character],
              }}
            >
              <div className="relative w-20 h-20 mx-auto mb-2 animate-float">
                <Image
                  src={char.image}
                  alt={char.name}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              <p
                className="text-sm font-medium text-center"
                style={{ color: '#000000' }}
              >
                {char.name}
              </p>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl font-medium"
          style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
