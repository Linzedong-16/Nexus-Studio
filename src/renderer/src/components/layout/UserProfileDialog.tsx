import { useRef, useState, useCallback } from 'react'
import { Upload, User, Mail, Link } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'
import CropperDialog from './CropperDialog'

interface UserProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前头像的显示 URL（本地 base64 或远程 URL） */
  currentAvatarSrc: string | null
}

/**
 * 用户信息编辑面板
 *
 * 头像来源两种模式：
 * - 本地裁剪：点击头像 → 选文件 → CropperDialog 裁剪 → 保存到 userData/avatar/avatar.png
 * - 远程链接：输入 URL → 点击加载 → 直接使用 URL，保存时删除旧的本地头像文件
 */
export default function UserProfileDialog({
  open,
  onOpenChange,
  currentAvatarSrc
}: UserProfileDialogProps): React.JSX.Element {
  const userStore = useUserStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 表单状态
  const [displayName, setDisplayName] = useState(userStore.displayName)
  const [email, setEmail] = useState(userStore.email)

  // 头像 & 裁剪状态
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(currentAvatarSrc)
  const [cropperOpen, setCropperOpen] = useState(false)
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [saving, setSaving] = useState(false)

  /** 点击头像 → 触发隐藏文件选择 */
  const handleAvatarClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  /** 本地文件选择 → 打开裁剪弹窗 */
  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCropSourceUrl(reader.result as string)
      setCropperOpen(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [])

  /** 裁剪完成回调：直接写入本地头像文件，更新预览 */
  const handleCropComplete = useCallback(async (dataUrl: string) => {
    setPreviewDataUrl(dataUrl)
    await window.api.avatar.save(dataUrl)
  }, [])

  /** URL 加载：直接回填头像预览 */
  const handleUrlLoad = useCallback(() => {
    const trimmed = urlInput.trim()
    if (!trimmed) {
      setUrlError('请输入图片链接')
      return
    }
    setUrlError('')
    setPreviewDataUrl(trimmed)
  }, [urlInput])

  /** 保存 */
  const handleSave = useCallback(async () => {
    setSaving(true)
    const isRemote = previewDataUrl && /^https?:\/\//.test(previewDataUrl)

    if (isRemote) {
      // 远程链接：删除旧的本地头像文件，只存 avatarUrl
      await window.api.avatar.delete()
      userStore.updateProfile({
        avatarType: 'remote',
        avatarUrl: previewDataUrl,
        displayName: displayName.trim() || 'LLinzex',
        email: email.trim(),
        avatarVersion: userStore.avatarVersion + 1
      })
    } else if (previewDataUrl) {
      // 本地裁剪：头像文件已通过 avatar:save 写入磁盘
      userStore.updateProfile({
        avatarType: 'local',
        avatarUrl: null,
        displayName: displayName.trim() || 'LLinzex',
        email: email.trim(),
        avatarVersion: userStore.avatarVersion + 1
      })
    }
    onOpenChange(false)
    setSaving(false)
  }, [previewDataUrl, displayName, email, userStore, onOpenChange])

  /** 对话框打开时重置表单 */
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setDisplayName(userStore.displayName)
        setEmail(userStore.email)
        setPreviewDataUrl(currentAvatarSrc)
        setCropSourceUrl(null)
        setUrlInput('')
        setUrlError('')
      }
      onOpenChange(open)
    },
    [userStore, currentAvatarSrc, onOpenChange]
  )

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-md flex-col gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>编辑个人信息</DialogTitle>
            <DialogDescription className="sr-only">修改头像、昵称和邮箱</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
            {/* ── 头像区域 ── */}
            <div className="flex flex-col items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFilePick}
                className="hidden"
              />

              <button
                type="button"
                onClick={handleAvatarClick}
                className="group relative cursor-pointer rounded-full"
                title="点击选择本地图片"
              >
                <Avatar className="size-24" size="lg">
                  {previewDataUrl && <AvatarImage src={previewDataUrl} alt="用户头像" />}
                  <AvatarFallback className="bg-primary/10 text-3xl text-primary">
                    {displayName ? displayName[0] : 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <Upload className="size-6 text-white" />
                </div>
              </button>

              <div className="flex w-full gap-2">
                <div className="relative flex-1">
                  <Link className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="粘贴图片链接"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value)
                      setUrlError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUrlLoad()
                    }}
                    className={cn('pl-8', urlError && 'border-destructive')}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={handleUrlLoad} className="shrink-0">
                  加载
                </Button>
              </div>
              {urlError && <p className="text-xs text-destructive">{urlError}</p>}
            </div>

            {/* ── 昵称 ── */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-display-name" className="flex items-center gap-1.5">
                <User className="size-3.5" />
                昵称
              </Label>
              <Input
                id="profile-display-name"
                placeholder="输入昵称"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={30}
              />
            </div>

            {/* ── 邮箱 ── */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-email" className="flex items-center gap-1.5">
                <Mail className="size-3.5" />
                邮箱
              </Label>
              <Input
                id="profile-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {cropSourceUrl && (
        <CropperDialog
          open={cropperOpen}
          onOpenChange={setCropperOpen}
          imageUrl={cropSourceUrl}
          onCropComplete={handleCropComplete}
        />
      )}
    </>
  )
}
