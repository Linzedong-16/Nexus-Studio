import { Button } from '@/components/ui/button'
import { useCounterStore } from '@/store/counter'
import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

function App(): React.JSX.Element {
  const { count, increment, decrement, reset } = useCounterStore()

  const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <img alt="logo" className="h-24 w-24" src={electronLogo} />

      <div className="text-center">
        <h1 className="text-2xl font-bold">
          Electron + Vite + React + TypeScript + Tailwind + shadcn/ui + Zustand
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Press <code className="rounded bg-muted px-1.5 py-0.5">F12</code> to open the devTools
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-lg border p-4">
        <Button variant="outline" size="icon" onClick={decrement}>
          -
        </Button>
        <span className="w-8 text-center text-lg font-medium tabular-nums">{count}</span>
        <Button variant="outline" size="icon" onClick={increment}>
          +
        </Button>
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">
            Documentation
          </a>
        </Button>
        <Button variant="secondary" onClick={ipcHandle}>
          Send IPC
        </Button>
      </div>

      <Versions />
    </div>
  )
}

export default App
