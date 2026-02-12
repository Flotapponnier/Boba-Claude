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

interface ChatStore {
  messages: Message[]
  isLoading: boolean
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: Math.random().toString(36).substring(7),
          timestamp: new Date(),
        },
      ],
    })),
  setLoading: (loading) => set({ isLoading: loading }),
  clearMessages: () => set({ messages: [] }),
}))
