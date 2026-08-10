/**
 * 主题切换的扩散过渡动画（specs/003-theme-toggle-transition/research.md §5/§6）
 * 使用浏览器原生 View Transitions API，clip-path 动画由合成器线程驱动
 */

let animating = false

function getEndRadius(x: number, y: number): number {
  const corners = [
    [0, 0],
    [window.innerWidth, 0],
    [0, window.innerHeight],
    [window.innerWidth, window.innerHeight]
  ]
  return Math.max(...corners.map(([cx, cy]) => Math.hypot(cx - x, cy - y)))
}

/**
 * 以 (originX, originY) 为圆心播放扩散动画，动画完成后 applyMode 已生效
 * - prefers-reduced-motion 开启时直接应用，跳过动画（FR-007）
 * - 动画播放期间忽略后续调用，防止连续快速点击导致堆积（FR-008）
 */
export function runThemeTransition(originX: number, originY: number, applyMode: () => void): void {
  if (animating) return

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion || !document.startViewTransition) {
    applyMode()
    return
  }

  animating = true
  const transition = document.startViewTransition(applyMode)

  transition.ready
    .then(() => {
      const endRadius = getEndRadius(originX, originY)
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${originX}px ${originY}px)`,
            `circle(${endRadius}px at ${originX}px ${originY}px)`
          ]
        },
        {
          duration: 500,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)'
        }
      )
    })
    .catch(() => {
      // ready 被拒绝（如页面导航）时无需额外处理，applyMode 已在 startViewTransition 中执行
    })

  transition.finished.finally(() => {
    animating = false
  })
}
