import { useState, useCallback, useRef, useEffect } from 'react'
import { ZoomIn, ZoomOut, RotateCw, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImagePreviewProps {
  /** 图片 base64 data URL */
  src: string
  /** 文件名（用于 alt） */
  fileName: string
}

/**
 * 图片预览组件
 *
 * 提供类似 VS Code 的图片预览体验：
 * - 鼠标滚轮缩放
 * - 拖拽平移
 * - 缩放/旋转/适应窗口按钮
 */
export default function ImagePreview({ src, fileName }: ImagePreviewProps): React.JSX.Element {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const fitToWindow = useCallback(() => {
    if (!containerRef.current || !imageRef.current) return
    const container = containerRef.current
    const img = imageRef.current
    const containerW = container.clientWidth - 40
    const containerH = container.clientHeight - 40
    const naturalW = img.naturalWidth || 1
    const naturalH = img.naturalHeight || 1
    const fitScale = Math.min(containerW / naturalW, containerH / naturalH, 1)
    setScale(fitScale)
    setPosition({ x: 0, y: 0 })
  }, [])

  // 图片加载完成后自适应
  const handleImageLoad = useCallback(() => {
    fitToWindow()
  }, [fitToWindow])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setScale((prev) => Math.max(0.1, Math.min(10, prev + delta)))
    },
    []
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      setIsDragging(true)
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y
      }
    },
    [position]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPosition({
        x: dragStart.current.posX + dx,
        y: dragStart.current.posY + dy
      })
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    const handleGlobalMouseUp = (): void => setIsDragging(false)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(10, prev + 0.25))
  }, [])

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(0.1, prev - 0.25))
  }, [])

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360)
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <span className="truncate text-xs text-muted-foreground">{fileName}</span>
        <span className="text-xs text-muted-foreground/60">
          {Math.round(scale * 100)}%
        </span>
        <div className="flex-1" />
        <Button size="icon" variant="ghost" onClick={handleZoomOut} title="缩小">
          <ZoomOut className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={handleZoomIn} title="放大">
          <ZoomIn className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={handleRotate} title="旋转">
          <RotateCw className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={fitToWindow} title="适应窗口">
          <Maximize2 className="size-3.5" />
        </Button>
      </div>

      {/* 图片区域 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-[#1e1e1e]"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`
          }}
        >
          <img
            ref={imageRef}
            src={src}
            alt={fileName}
            className="max-w-none select-none"
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out'
            }}
            onLoad={handleImageLoad}
            draggable={false}
          />
        </div>
      </div>
    </div>
  )
}
