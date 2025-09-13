import { create } from 'zustand'

export interface BrowserEvent {
  id: string
  type: string
  timestamp: string
  element: {
    tagName: string
    id: string
    className: string
    text: string
    href: string
    src: string
  }
  details: any
  url: string
  sessionId?: string
  // Console-specific fields
  level?: 'log' | 'warn' | 'error' | 'info' | 'debug'
  args?: string[]
  stack?: string
}

interface BrowserEventsStore {
  events: BrowserEvent[]
  addEvent: (event: BrowserEvent) => void
  clearEvents: () => void
  getEventsBySession: (sessionId: string) => BrowserEvent[]
}

export const useBrowserEvents = create<BrowserEventsStore>((set, get) => ({
  events: [],
  addEvent: (event) => set((state) => {
    // Check for duplicate events by unique ID
    const isDuplicate = state.events.some(existing => existing.id === event.id)
    
    if (isDuplicate) {
      return state
    }
    
    return {
      events: [...state.events, event]
    }
  }),
  clearEvents: () => set({ events: [] }),
  getEventsBySession: (sessionId: string) => {
    return get().events.filter(event => event.sessionId === sessionId)
  }
}))