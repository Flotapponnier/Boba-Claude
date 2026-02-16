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
}

interface ChatStore {
  sessions: Map<string, ChatSession>
  currentSessionId: string | null
  isLoading: boolean

  // Session management
  createSession: () => string
  switchSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => void
  getSessions: () => ChatSession[]
  getCurrentSession: () => ChatSession | null

  // Message management
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      sessions: new Map(),
      currentSessionId: null,
      isLoading: false,

      createSession: () => {
        const id = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`
        const newSession: ChatSession = {
          id,
          title: 'New Chat',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        set((state) => {
          const sessions = new Map(state.sessions)
          sessions.set(id, newSession)
          return { sessions, currentSessionId: id }
        })

        return id
      },

      switchSession: (sessionId: string) => {
        set({ currentSessionId: sessionId })
      },

      deleteSession: (sessionId: string) => {
        set((state) => {
          const sessions = new Map(state.sessions)
          sessions.delete(sessionId)

          let newCurrentId = state.currentSessionId
          if (state.currentSessionId === sessionId) {
            const remainingSessions = Array.from(sessions.keys())
            newCurrentId = remainingSessions.length > 0 ? remainingSessions[0] : null
          }

          return { sessions, currentSessionId: newCurrentId }
        })
      },

      getSessions: () => {
        return Array.from(get().sessions.values()).sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
        )
      },

      getCurrentSession: () => {
        const { currentSessionId, sessions } = get()
        if (!currentSessionId) return null
        return sessions.get(currentSessionId) || null
      },

      addMessage: (message) => {
        set((state) => {
          const { currentSessionId, sessions } = state
          if (!currentSessionId) return state

          const session = sessions.get(currentSessionId)
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

          const newSessions = new Map(sessions)
          newSessions.set(currentSessionId, updatedSession)

          return { sessions: newSessions }
        })
      },

      setLoading: (loading) => set({ isLoading: loading }),

      clearMessages: () => {
        set((state) => {
          const { currentSessionId, sessions } = state
          if (!currentSessionId) return state

          const session = sessions.get(currentSessionId)
          if (!session) return state

          const updatedSession: ChatSession = {
            ...session,
            messages: [],
            updatedAt: new Date(),
          }

          const newSessions = new Map(sessions)
          newSessions.set(currentSessionId, updatedSession)

          return { sessions: newSessions }
        })
      },
    }),
    {
      name: 'chat-storage',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const { state } = JSON.parse(str)
          return {
            state: {
              ...state,
              sessions: new Map(
                Object.entries(state.sessions || {}).map(([id, session]: [string, any]) => [
                  id,
                  {
                    ...session,
                    createdAt: new Date(session.createdAt),
                    updatedAt: new Date(session.updatedAt),
                    messages: session.messages.map((msg: any) => ({
                      ...msg,
                      timestamp: new Date(msg.timestamp),
                    })),
                  },
                ])
              ),
            },
          }
        },
        setItem: (name, value) => {
          const { state } = value
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                sessions: Object.fromEntries(state.sessions),
              },
            })
          )
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
)
