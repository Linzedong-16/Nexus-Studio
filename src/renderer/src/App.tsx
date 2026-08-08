import { RouterProvider } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { router } from '@/router/router'

function App(): React.JSX.Element {
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  )
}

export default App
