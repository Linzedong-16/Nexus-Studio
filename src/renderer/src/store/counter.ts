import { create } from 'zustand'

interface CounterState {
  count: number
  increment: () => void
  decrement: () => void
  reset: () => void
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: (): void => set((state) => ({ count: state.count + 1 })),
  decrement: (): void => set((state) => ({ count: state.count - 1 })),
  reset: (): void => set({ count: 0 })
}))
