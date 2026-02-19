import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BobaCharacter = 'black' | 'orange' | 'pink' | 'gold'
export type Theme = 'black' | 'orange' | 'pink' | 'gold'

interface BobaStore {
  character: BobaCharacter
  theme: Theme
  setCharacter: (character: BobaCharacter) => void
}

export const useBobaStore = create<BobaStore>()(
  persist(
    (set) => ({
      character: 'orange',
      theme: 'orange',
      setCharacter: (character) => set({ character, theme: character }),
    }),
    {
      name: 'boba-storage',
    }
  )
)

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  toolName?: string
  toolId?: string
}

interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  isLoading: boolean
}

interface ChatStore {
  sessions: Record<string, ChatSession>
  currentSessionId: string | null
  wasConnected: boolean

  // Session management
  createSession: () => string
  switchSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => void
  renameSession: (sessionId: string, title: string) => void

  // Connection state
  setWasConnected: (connected: boolean) => void

  // Message management
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  setLoading: (sessionId: string, loading: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      sessions: {},
      currentSessionId: null,
      wasConnected: false,

      createSession: () => {
        const id = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`
        const newSession: ChatSession = {
          id,
          title: 'New Chat',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          isLoading: false,
        }

        set((state) => ({
          sessions: { ...state.sessions, [id]: newSession },
          currentSessionId: id,
        }))

        return id
      },

      switchSession: (sessionId: string) => {
        set({ currentSessionId: sessionId })
      },

      deleteSession: (sessionId: string) => {
        set((state) => {
          const { [sessionId]: deleted, ...remainingSessions } = state.sessions

          let newCurrentId = state.currentSessionId
          if (state.currentSessionId === sessionId) {
            const remainingIds = Object.keys(remainingSessions)
            newCurrentId = remainingIds.length > 0 ? remainingIds[0] : null
          }

          return { sessions: remainingSessions, currentSessionId: newCurrentId }
        })
      },

      renameSession: (sessionId: string, title: string) => {
        set((state) => {
          const session = state.sessions[sessionId]
          if (!session) return state

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                title,
                updatedAt: new Date(),
              },
            },
          }
        })
      },

      setWasConnected: (connected: boolean) => set({ wasConnected: connected }),

      addMessage: (message) => {
        set((state) => {
          const { currentSessionId, sessions } = state
          if (!currentSessionId) return state

          const session = sessions[currentSessionId]
          if (!session) return state

          const newMessage: Message = {
            ...message,
            id: Math.random().toString(36).substring(7),
            timestamp: new Date(),
          }

          const updatedSession: ChatSession = {
            ...session,
            messages: [...session.messages, newMessage],
            updatedAt: new Date(),
            title: session.messages.length === 0 && message.role === 'user'
              ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
              : session.title,
          }

          return {
            sessions: { ...sessions, [currentSessionId]: updatedSession },
          }
        })
      },

      setLoading: (sessionId: string, loading: boolean) => {
        set((state) => {
          const session = state.sessions[sessionId]
          if (!session) return state

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                isLoading: loading,
              },
            },
          }
        })
      },

      clearMessages: () => {
        set((state) => {
          const { currentSessionId, sessions } = state
          if (!currentSessionId) return state

          const session = sessions[currentSessionId]
          if (!session) return state

          const updatedSession: ChatSession = {
            ...session,
            messages: [],
            updatedAt: new Date(),
          }

          return {
            sessions: { ...sessions, [currentSessionId]: updatedSession },
          }
        })
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        // Don't persist wasConnected - always start disconnected
      }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          try {
            const parsed = JSON.parse(str)
            const state = parsed.state || parsed
            return {
              state: {
                ...state,
                sessions: Object.fromEntries(
                  Object.entries(state.sessions || {}).map(([id, session]: [string, any]) => [
                    id,
                    {
                      ...session,
                      createdAt: new Date(session.createdAt),
                      updatedAt: new Date(session.updatedAt),
                      isLoading: false, // Always reset on page load - never persist stuck states
                      messages: (session.messages || []).map((msg: any) => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp),
                      })),
                    },
                  ])
                ),
              },
            }
          } catch (e) {
            console.error('Error parsing chat storage:', e)
            return null
          }
        },
        setItem: (name, value) => {
          const state = value.state || value
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                sessions: Object.fromEntries(
                  Object.entries(state.sessions || {}).map(([id, session]: [string, any]) => [
                    id,
                    {
                      ...session,
                      createdAt: session.createdAt?.toISOString?.() || session.createdAt,
                      updatedAt: session.updatedAt?.toISOString?.() || session.updatedAt,
                      messages: (session.messages || []).map((msg: any) => ({
                        ...msg,
                        timestamp: msg.timestamp?.toISOString?.() || msg.timestamp,
                      })),
                    },
                  ])
                ),
              },
            })
          )
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
)
