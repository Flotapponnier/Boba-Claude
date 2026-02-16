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
  sessions: Record<string, ChatSession>
  currentSessionId: string | null
  isLoading: boolean

  // Session management
  createSession: () => string
  switchSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => void

  // Message management
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      sessions: {},
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

      setLoading: (loading) => set({ isLoading: loading }),

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
      serialize: (state) => {
        return JSON.stringify({
          state: {
            ...state.state,
            sessions: Object.fromEntries(
              Object.entries(state.state.sessions).map(([id, session]) => [
                id,
                {
                  ...session,
                  createdAt: (session as ChatSession).createdAt.toISOString(),
                  updatedAt: (session as ChatSession).updatedAt.toISOString(),
                  messages: (session as ChatSession).messages.map((msg) => ({
                    ...msg,
                    timestamp: msg.timestamp.toISOString(),
                  })),
                },
              ])
            ),
          },
        })
      },
      deserialize: (str) => {
        const { state } = JSON.parse(str)
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
    }
  )
)
