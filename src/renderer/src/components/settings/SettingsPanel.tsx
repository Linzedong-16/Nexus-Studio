import { Keyboard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/shellStore'
import { useKeybindingStore } from '@/store/keybindingStore'
import KeybindingsTab from './KeybindingsTab'

/**
 * 设置面板（仿 VS Code 设置 UI）：居中悬浮，左侧分类导航 + 右侧内容
 * 点击面板外空白区域关闭为 Radix Dialog 默认行为，无需额外代码
 */
export default function SettingsPanel(): React.JSX.Element {
  const settingsOpen = useShellStore((s) => s.settingsOpen)
  const setSettingsOpen = useShellStore((s) => s.setSettingsOpen)
  const recordingEntryId = useKeybindingStore((s) => s.recordingEntryId)

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent
        className="flex h-[560px] max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl"
        onEscapeKeyDown={(e) => {
          // 录制态自身已处理 Escape（取消录制），此处兜底避免面板被同一次按键误关闭
          if (recordingEntryId !== null) e.preventDefault()
        }}
      >
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>设置</DialogTitle>
          <DialogDescription className="sr-only">应用设置</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <nav className="w-44 shrink-0 border-r p-2">
            <div
              className={cn(
                'flex items-center gap-2 rounded-md bg-accent px-2.5 py-1.5 text-[13px] font-medium text-accent-foreground'
              )}
            >
              <Keyboard className="size-4" />
              快捷键
            </div>
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <KeybindingsTab />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
