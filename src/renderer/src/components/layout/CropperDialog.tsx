import { useRef, useCallback } from 'react'
import { Image } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import CropperBox from '@/components/common/CropperBox'
import type { CropperBoxHandle } from '@/components/common/CropperBox'

interface CropperDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 待裁剪图片 URL */
  imageUrl: string
  /** 裁剪完成后回调，返回裁剪后的 DataURL */
  onCropComplete: (dataUrl: string) => void
}

/**
 * 头像裁剪弹窗
 *
 * 独立 Dialog，内嵌 CropperBox 组件，裁剪完成后回调父组件。
 */
export default function CropperDialog({
  open,
  onOpenChange,
  imageUrl,
  onCropComplete
}: CropperDialogProps): React.JSX.Element {
  const cropperRef = useRef<CropperBoxHandle>(null)

  const handleConfirm = useCallback(async () => {
    try {
      const dataUrl = await cropperRef.current?.getCropDataUrl()
      if (dataUrl) {
        onCropComplete(dataUrl)
        onOpenChange(false)
      }
    } catch {
      // 裁剪失败
    }
  }, [onCropComplete, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-fit flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>裁剪头像</DialogTitle>
          <DialogDescription className="sr-only">拖拽、缩放、旋转调整头像区域</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 p-6">
          <CropperBox
            ref={cropperRef}
            imageUrl={imageUrl}
            cropSize={240}
            outputSize={200}
            className="mx-auto"
          />
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm} className="gap-1.5">
            <Image className="size-4" />
            确认裁剪
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
