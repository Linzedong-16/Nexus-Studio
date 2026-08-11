import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Loader2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 裁剪状态数据
 *
 * 通过 onUpdate 回调实时传递给父组件，用于预览或外部控制
 */
export interface CropState {
  x: number
  y: number
  scale: number
  rotation: number
  containerW: number
  containerH: number
  cropSize: number
  imgW: number
  imgH: number
}

/** CropperBox 暴露给父组件的公开方法 */
export interface CropperBoxHandle {
  /** 获取裁剪后的 Blob 对象 */
  getCropBlob: () => Promise<Blob>
  /** 获取裁剪后的 DataURL 字符串 */
  getCropDataUrl: () => Promise<string>
  /** 设置缩放级别 */
  setScale: (s: number) => void
  /** 向左旋转 90° */
  rotateLeft: () => void
  /** 向右旋转 90° */
  rotateRight: () => void
  /** 获取当前缩放值 */
  getScale: () => number
  /** 获取当前旋转角度 */
  getRotation: () => number
}

interface CropperBoxProps {
  /** 待裁剪图片 URL */
  imageUrl: string
  /** 圆形裁剪框直径（px），默认 240 */
  cropSize?: number
  /** 输出图片尺寸（px），默认 200 */
  outputSize?: number
  /** 输出图片格式，默认 'png' */
  outputType?: 'png' | 'jpeg' | 'webp'
  /** 输出图片质量 0-1，默认 0.92 */
  outputQuality?: number
  /** 图片加载完成回调 */
  onLoad?: (status: 'success' | 'error') => void
  /** 实时预览数据更新回调 */
  onUpdate?: (data: CropState) => void
  /** 额外 CSS 类名 */
  className?: string
}

/**
 * 图片裁剪组件（React 移植版）
 *
 * 基于 Canvas 的纯前端图片裁剪器，支持圆形裁剪框，
 * 鼠标拖拽平移、滚轮缩放、双指缩放、90° 旋转。
 * 零外部依赖，所有裁剪逻辑基于 Canvas 2D API 实现。
 *
 * 迁移自 Vue3 版本 CropperBox.vue，保持相同的变换链和裁剪算法。
 */
const CropperBox = forwardRef<CropperBoxHandle, CropperBoxProps>(
  (
    {
      imageUrl,
      cropSize = 240,
      outputSize = 200,
      outputType = 'png',
      outputQuality = 0.92,
      onLoad,
      onUpdate,
      className
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const imgRef = useRef<HTMLImageElement>(null)

    const [loaded, setLoaded] = useState(false)
    const [imgNaturalW, setImgNaturalW] = useState(0)
    const [imgNaturalH, setImgNaturalH] = useState(0)
    const [containerW, setContainerW] = useState(0)
    const [containerH, setContainerH] = useState(0)

    // 图片变换状态
    const posXRef = useRef(0)
    const posYRef = useRef(0)
    const scaleRef = useRef(1)
    const rotationRef = useRef(0)
    const [posX, setPosX] = useState(0)
    const [posY, setPosY] = useState(0)
    const [scale, setScaleState] = useState(1)
    const [rotation, setRotation] = useState(0)

    // 拖拽状态
    const draggingRef = useRef(false)
    const dragStartXRef = useRef(0)
    const dragStartYRef = useRef(0)
    const dragStartPosXRef = useRef(0)
    const dragStartPosYRef = useRef(0)

    // 双指缩放状态
    const pinchStartDistRef = useRef(0)
    const pinchStartScaleRef = useRef(1)

    /** 初始化容器尺寸 */
    const initContainerSize = useCallback(() => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setContainerW(rect.width)
      setContainerH(rect.height)
    }, [])

    /** 发送预览数据（~60fps 节流） */
    const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const emitUpdate = useCallback(() => {
      if (updateTimerRef.current) return
      updateTimerRef.current = setTimeout(() => {
        updateTimerRef.current = null
        onUpdate?.({
          x: posXRef.current,
          y: posYRef.current,
          scale: scaleRef.current,
          rotation: rotationRef.current,
          containerW,
          containerH,
          cropSize,
          imgW: imgNaturalW,
          imgH: imgNaturalH
        })
      }, 16)
    }, [onUpdate, containerW, containerH, cropSize, imgNaturalW, imgNaturalH])

    /** 图片加载完成 */
    const handleImgLoad = useCallback(
      (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.target as HTMLImageElement
        setImgNaturalW(img.naturalWidth)
        setImgNaturalH(img.naturalHeight)
        setLoaded(true)
        initContainerSize()
        // 需要在下一帧执行 resetPosition，因为 setState 是异步的
        requestAnimationFrame(() => {
          const scaleW = cropSize / img.naturalWidth
          const scaleH = cropSize / img.naturalHeight
          const newScale = Math.max(scaleW, scaleH, 0.5)
          scaleRef.current = newScale
          posXRef.current = 0
          posYRef.current = 0
          rotationRef.current = 0
          setScaleState(newScale)
          setPosX(0)
          setPosY(0)
          setRotation(0)
          onLoad?.('success')
          emitUpdate()
        })
      },
      [cropSize, initContainerSize, onLoad, emitUpdate]
    )

    const handleImgError = useCallback(() => {
      onLoad?.('error')
    }, [onLoad])

    // ── 鼠标事件 ──

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (!loaded) return
        e.preventDefault()
        draggingRef.current = true
        dragStartXRef.current = e.clientX
        dragStartYRef.current = e.clientY
        dragStartPosXRef.current = posXRef.current
        dragStartPosYRef.current = posYRef.current
      },
      [loaded]
    )

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!draggingRef.current) return
        const dx = e.clientX - dragStartXRef.current
        const dy = e.clientY - dragStartYRef.current
        posXRef.current = dragStartPosXRef.current + dx / scaleRef.current
        posYRef.current = dragStartPosYRef.current + dy / scaleRef.current
        setPosX(posXRef.current)
        setPosY(posYRef.current)
        emitUpdate()
      },
      [emitUpdate]
    )

    const handleMouseUp = useCallback(() => {
      draggingRef.current = false
    }, [])

    // ── 滚轮缩放 ──

    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        if (!loaded) return
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.05 : 0.05
        const newScale = Math.max(0.1, Math.min(5, scaleRef.current + delta))
        scaleRef.current = newScale
        setScaleState(newScale)
        emitUpdate()
      },
      [loaded, emitUpdate]
    )

    // ── 触摸事件（双指缩放）──

    const getTouchDistance = (e: React.TouchEvent): number => {
      if (e.touches.length < 2) return 0
      const t0 = e.touches[0]!
      const t1 = e.touches[1]!
      const dx = t0.clientX - t1.clientX
      const dy = t0.clientY - t1.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        if (!loaded) return
        if (e.touches.length === 2) {
          pinchStartDistRef.current = getTouchDistance(e)
          pinchStartScaleRef.current = scaleRef.current
        } else if (e.touches.length === 1) {
          const touch = e.touches[0]!
          draggingRef.current = true
          dragStartXRef.current = touch.clientX
          dragStartYRef.current = touch.clientY
          dragStartPosXRef.current = posXRef.current
          dragStartPosYRef.current = posYRef.current
        }
      },
      [loaded]
    )

    const handleTouchMove = useCallback(
      (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
          const dist = getTouchDistance(e)
          const newScale = pinchStartScaleRef.current * (dist / pinchStartDistRef.current)
          scaleRef.current = Math.max(0.1, Math.min(5, newScale))
          setScaleState(scaleRef.current)
          emitUpdate()
        } else if (e.touches.length === 1 && draggingRef.current) {
          const touch = e.touches[0]!
          const dx = touch.clientX - dragStartXRef.current
          const dy = touch.clientY - dragStartYRef.current
          posXRef.current = dragStartPosXRef.current + dx / scaleRef.current
          posYRef.current = dragStartPosYRef.current + dy / scaleRef.current
          setPosX(posXRef.current)
          setPosY(posYRef.current)
          emitUpdate()
        }
      },
      [emitUpdate]
    )

    const handleTouchEnd = useCallback(() => {
      draggingRef.current = false
    }, [])

    // ── Canvas 裁剪渲染 ──

    /**
     * 将裁剪区域渲染到 Canvas
     *
     * 复现 CSS 变换链，精确导出所见内容。
     * CSS 变换：translate(-50%,-50%) translate(posX,posY) scale(s) rotate(r)
     */
    const renderCropToCanvas = useCallback((): HTMLCanvasElement | null => {
      const img = imgRef.current
      if (!img || !loaded) return null

      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      // 圆形裁剪路径
      ctx.beginPath()
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2)
      ctx.clip()

      const canvasScale = outputSize / cropSize

      ctx.save()
      // 1. 原点移至 canvas 中心
      ctx.translate(outputSize / 2, outputSize / 2)
      // 2. 容器坐标 → canvas 坐标
      ctx.scale(canvasScale, canvasScale)
      // 3. 图片偏移
      ctx.translate(posXRef.current, posYRef.current)
      // 4. 图片缩放
      ctx.scale(scaleRef.current, scaleRef.current)
      // 5. 图片旋转
      if (rotationRef.current % 360 !== 0) {
        const rad = (rotationRef.current * Math.PI) / 180
        ctx.rotate(rad)
      }
      // 6. 绘制图片
      ctx.drawImage(img, -imgNaturalW / 2, -imgNaturalH / 2, imgNaturalW, imgNaturalH)
      ctx.restore()

      return canvas
    }, [loaded, outputSize, cropSize, imgNaturalW, imgNaturalH])

    /** 获取裁剪后的 Blob */
    const getCropBlob = useCallback((): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        const canvas = renderCropToCanvas()
        if (!canvas) {
          reject(new Error('无法生成裁剪结果'))
          return
        }
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Blob 生成失败'))
          },
          `image/${outputType}`,
          outputQuality
        )
      })
    }, [renderCropToCanvas, outputType, outputQuality])

    /** 获取裁剪后的 DataURL */
    const getCropDataUrl = useCallback((): Promise<string> => {
      return new Promise((resolve, reject) => {
        const canvas = renderCropToCanvas()
        if (!canvas) {
          reject(new Error('无法生成裁剪结果'))
          return
        }
        resolve(canvas.toDataURL(`image/${outputType}`, outputQuality))
      })
    }, [renderCropToCanvas, outputType, outputQuality])

    /** 设置缩放级别 */
    const setScaleFn = useCallback(
      (s: number) => {
        const newScale = Math.max(0.1, Math.min(5, s))
        scaleRef.current = newScale
        setScaleState(newScale)
        emitUpdate()
      },
      [emitUpdate]
    )

    /** 向左旋转 90° */
    const rotateLeft = useCallback(() => {
      rotationRef.current = (rotationRef.current - 90) % 360
      setRotation(rotationRef.current)
      emitUpdate()
    }, [emitUpdate])

    /** 向右旋转 90° */
    const rotateRight = useCallback(() => {
      rotationRef.current = (rotationRef.current + 90) % 360
      setRotation(rotationRef.current)
      emitUpdate()
    }, [emitUpdate])

    const getScale = useCallback(() => scaleRef.current, [])
    const getRotation = useCallback(() => rotationRef.current, [])

    // 暴露公开方法
    useImperativeHandle(
      ref,
      () => ({
        getCropBlob,
        getCropDataUrl,
        setScale: setScaleFn,
        rotateLeft,
        rotateRight,
        getScale,
        getRotation
      }),
      [getCropBlob, getCropDataUrl, setScaleFn, rotateLeft, rotateRight, getScale, getRotation]
    )

    // ── 生命周期 ──

    // 容器尺寸监听
    useEffect(() => {
      initContainerSize()
      const el = containerRef.current
      if (!el) return
      const observer = new ResizeObserver(() => initContainerSize())
      observer.observe(el)
      return () => observer.disconnect()
    }, [initContainerSize])

    // 监听 imageUrl 变化，重置状态
    useEffect(() => {
      setLoaded(false)
      setImgNaturalW(0)
      setImgNaturalH(0)
      posXRef.current = 0
      posYRef.current = 0
      scaleRef.current = 1
      rotationRef.current = 0
      setPosX(0)
      setPosY(0)
      setScaleState(1)
      setRotation(0)
    }, [imageUrl])

    // ── 计算样式 ──

    const isRotated = rotation % 360 !== 0
    const rotationDisplay = ((rotation % 360) + 360) % 360

    return (
      <div className={cn('relative flex flex-col', className)}>
        {/* 工具栏：缩放 + 旋转 */}
        <div className="mb-2 flex items-center justify-center gap-1">
          <button
            type="button"
            title="缩小"
            onClick={() => setScaleFn(scaleRef.current - 0.1)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="min-w-10 text-center text-xs text-muted-foreground">
            {Math.round(scaleRef.current * 100)}%
          </span>
          <button
            type="button"
            title="放大"
            onClick={() => setScaleFn(scaleRef.current + 0.1)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ZoomIn className="size-4" />
          </button>
          <div className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            title="向左旋转 90°"
            onClick={rotateLeft}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            title="向右旋转 90°"
            onClick={rotateRight}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RotateCw className="size-4" />
          </button>
        </div>

        {/* 裁剪区域 */}
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-lg select-none touch-none"
          style={{ width: cropSize, height: cropSize }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* 棋盘格背景 */}
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: '#f0f0f0',
              backgroundImage:
                'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
            }}
          />

          {/* 图片层 */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt="cropper"
            draggable={false}
            className="absolute"
            style={{
              top: '50%',
              left: '50%',
              width: imgNaturalW,
              height: imgNaturalH,
              maxWidth: 'none',
              transform: `translate(-50%, -50%) translate(${posX}px, ${posY}px) scale(${scale}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              pointerEvents: 'none',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 0.15s ease'
            }}
            onLoad={handleImgLoad}
            onError={handleImgError}
          />

          {/* 加载中 */}
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
            </div>
          )}

          {/* 圆形遮罩 */}
          <div
            className="absolute rounded-full"
            style={{
              top: '50%',
              left: '50%',
              width: cropSize,
              height: cropSize,
              marginLeft: -cropSize / 2,
              marginTop: -cropSize / 2,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
              pointerEvents: 'none'
            }}
          >
            {/* 裁剪框边框 */}
            <div
              className="absolute rounded-full"
              style={{
                inset: -2,
                border: '2px solid rgba(255, 255, 255, 0.9)',
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(0, 0, 0, 0.15)',
                pointerEvents: 'none'
              }}
            />
          </div>

          {/* 旋转角标 */}
          {isRotated && (
            <div
              className="absolute top-3 right-3 rounded px-2 py-0.5 text-xs font-medium text-white pointer-events-none"
              style={{ background: 'rgba(0, 0, 0, 0.65)' }}
            >
              {rotationDisplay}°
            </div>
          )}
        </div>
      </div>
    )
  }
)

CropperBox.displayName = 'CropperBox'

export default CropperBox
