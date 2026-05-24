import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TimerState {
  sessionId: string | null
  startTime: number | null
  elapsed: number
  isRunning: boolean
  mode: 'deepwork' | 'break'
  startTimer: (sessionId: string, mode?: 'deepwork' | 'break') => void
  pauseTimer: () => void
  resumeTimer: () => void
  stopTimer: () => void
  tick: () => void
  setMode: (mode: 'deepwork' | 'break') => void
  resetTimer: () => void
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      startTime: null,
      elapsed: 0,
      isRunning: false,
      mode: 'deepwork',

      startTimer: (sessionId: string, mode = 'deepwork') => {
        const now = Date.now()
        set({ sessionId, startTime: now, isRunning: true, mode })
      },

      pauseTimer: () => {
        set({ isRunning: false })
      },

      resumeTimer: () => {
        // Adjust startTime back by elapsed time to resume cleanly
        const { elapsed } = get()
        const newStartTime = Date.now() - (elapsed * 1000)
        set({ isRunning: true, startTime: newStartTime })
      },

      stopTimer: () => {
        set({ sessionId: null, startTime: null, isRunning: false, elapsed: 0 })
      },

      tick: () => {
        const { startTime, isRunning } = get()
        if (isRunning && startTime) {
          set({ elapsed: Math.floor((Date.now() - startTime) / 1000) })
        }
      },
      
      setMode: (mode: 'deepwork' | 'break') => {
        set({ mode })
      },

      resetTimer: () => {
         set({ sessionId: null, startTime: null, isRunning: false, elapsed: 0 })
      }
    }),
    {
      name: 'dw-timer-storage',
    }
  )
)
