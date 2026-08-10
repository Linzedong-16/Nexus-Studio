import { cn } from '@/lib/utils'

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>): React.JSX.Element {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

interface KeyChipsProps {
  /** 一个或两个 chord（两段式快捷键），如 ['Ctrl+K', 'Ctrl+W'] */
  chords: string[]
  className?: string
}

/** 渲染一组 chord，每个 chord 内按 "+" 拆分为多个 Kbd，chord 之间用逗号分隔（VS Code 两段式快捷键展示惯例） */
function KeyChips({ chords, className }: KeyChipsProps): React.JSX.Element {
  if (chords.length === 0) {
    return <span className="text-xs text-muted-foreground">未设置</span>
  }
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {chords.map((chord, chordIdx) => (
        <span key={chordIdx} className="inline-flex items-center gap-1">
          {chordIdx > 0 && <span className="text-muted-foreground">,</span>}
          {chord.split('+').map((key, keyIdx) => (
            <Kbd key={keyIdx}>{key}</Kbd>
          ))}
        </span>
      ))}
    </span>
  )
}

export { Kbd, KeyChips }
