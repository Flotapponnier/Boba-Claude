'use client'

import { useState } from 'react'
import { useChatStore, useBobaStore } from '@/lib/store'
import Image from 'next/image'
import { Settings, Send } from 'lucide-react'

const CHARACTER_IMAGES = {
  black: '/assets/branding/black_boba.png',
  orange: '/assets/branding/boba.png',
  pink: '/assets/branding/pinky_boba.png',
  gold: '/assets/branding/golden_boba.png',
}

export default function HomePage() {
  const [showSettings, setShowSettings] = useState(false)
  const [input, setInput] = useState('')
  const { messages, isLoading, addMessage, setLoading } = useChatStore()
  const { character } = useBobaStore()

  const handleSendMessage = async () => {
    if (!input.trim()) return

    addMessage({ role: 'user', content: input })
    setInput('')
    setLoading(true)

    // Simulate AI response
    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: `This is a demo response to: "${input}". Claude Code integration coming soon!`,
      })
      setLoading(false)
    }, 2000)
  }

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b"
        style={{ borderColor: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10">
            <Image
              src={CHARACTER_IMAGES[character]}
              alt="Boba"
              fill
              className="object-contain"
            />
          </div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Boba Claude
          </h1>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-lg hover:bg-opacity-10 hover:bg-black transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          <Settings size={24} />
        </button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="relative w-32 h-32 mb-4">
              <Image
                src={CHARACTER_IMAGES[character]}
                alt="Boba"
                fill
                className="object-contain"
              />
            </div>
            <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
              Say hi to your Boba friend!
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="relative w-8 h-8 mr-2 flex-shrink-0">
                  <Image
                    src={CHARACTER_IMAGES[character]}
                    alt="Boba"
                    fill
                    className="object-contain"
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
          <div className="flex justify-start">
            <div className="relative w-12 h-12 mr-2">
              <Image
                src={CHARACTER_IMAGES[character]}
                alt="Boba"
                fill
                className="object-contain animate-rotate-slow"
              />
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
      <div className="p-4 border-t" style={{ borderColor: 'var(--bg-secondary)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..."
            className="flex-1 p-3 rounded-xl outline-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="p-3 rounded-xl disabled:opacity-50 transition-all hover:scale-105"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Send size={20} color="#ffffff" />
          </button>
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

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 max-w-md w-full"
        style={{ backgroundColor: 'var(--bg-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
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
                character === char.id ? 'ring-4' : ''
              }`}
              style={{
                backgroundColor: 'var(--bg-secondary)',
                ringColor: 'var(--accent)',
              }}
            >
              <div className="relative w-20 h-20 mx-auto mb-2">
                <Image
                  src={char.image}
                  alt={char.name}
                  fill
                  className="object-contain"
                />
              </div>
              <p
                className="text-sm font-medium text-center"
                style={{ color: 'var(--text-primary)' }}
              >
                {char.name}
              </p>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl font-medium text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
