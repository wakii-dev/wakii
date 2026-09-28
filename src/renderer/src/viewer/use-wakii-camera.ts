import { useEffect, useRef, type RefObject } from 'react'
import { WORLD } from './wakii-graph-layout'

export type WakiiCamera = { fit: () => void }

const ZOOM_MIN = 0.3
const ZOOM_MAX = 2.6
const FIT_MARGIN = 0.93

/**
 * Camera for the mindmap canvas — pan/zoom run at 60fps so the `{x,y,k}` state
 * lives in a ref and lands on `viewportEl.style.transform` directly; no React
 * state, so no graph re-render per tick (direction: camera = ref imperative).
 * Exposes `fit` through the returned ref for the "Fit view" button and the
 * window resize listener.
 */
export function useWakiiCamera(
  canvasRef: RefObject<HTMLDivElement | null>,
  viewportRef: RefObject<HTMLDivElement | null>
): RefObject<WakiiCamera | null> {
  const camRef = useRef<WakiiCamera | null>(null)

  useEffect(() => {
    const canvasEl = canvasRef.current
    const viewportEl = viewportRef.current
    if (!canvasEl || !viewportEl) {
      return
    }

    const st = { x: 0, y: 0, k: 1 }
    const apply = (): void => {
      viewportEl.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.k})`
    }
    const fit = (): void => {
      const rect = canvasEl.getBoundingClientRect()
      if (!rect.width || !rect.height) {
        return
      }
      st.k = Math.min(rect.width / WORLD.w, rect.height / WORLD.h) * FIT_MARGIN
      st.x = (rect.width - WORLD.w * st.k) / 2
      st.y = (rect.height - WORLD.h * st.k) / 2
      apply()
    }
    camRef.current = { fit }

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = canvasEl.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const k2 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, st.k * Math.exp(-e.deltaY * 0.0016)))
      st.x = mx - (mx - st.x) * (k2 / st.k)
      st.y = my - (my - st.y) * (k2 / st.k)
      st.k = k2
      apply()
    }
    let drag: { x: number; y: number; vx: number; vy: number } | null = null
    const onPointerDown = (e: PointerEvent): void => {
      // Nodes, panel and popovers are interactive; only the bare canvas pans.
      if (!(e.target instanceof Element)) {
        return
      }
      if (e.target.closest('.wakii-node, .wakii-panel, .wakii-warnbox, .wakii-errbox')) {
        return
      }
      drag = { x: e.clientX, y: e.clientY, vx: st.x, vy: st.y }
      canvasEl.classList.add('wakii-panning')
      canvasEl.setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent): void => {
      if (!drag) {
        return
      }
      st.x = drag.vx + e.clientX - drag.x
      st.y = drag.vy + e.clientY - drag.y
      apply()
    }
    const onPointerUp = (): void => {
      drag = null
      canvasEl.classList.remove('wakii-panning')
    }
    const onResize = (): void => fit()

    canvasEl.addEventListener('wheel', onWheel, { passive: false })
    canvasEl.addEventListener('pointerdown', onPointerDown)
    canvasEl.addEventListener('pointermove', onPointerMove)
    canvasEl.addEventListener('pointerup', onPointerUp)
    canvasEl.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('resize', onResize)
    fit()
    return () => {
      camRef.current = null
      canvasEl.removeEventListener('wheel', onWheel)
      canvasEl.removeEventListener('pointerdown', onPointerDown)
      canvasEl.removeEventListener('pointermove', onPointerMove)
      canvasEl.removeEventListener('pointerup', onPointerUp)
      canvasEl.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('resize', onResize)
    }
  }, [canvasRef, viewportRef])

  return camRef
}
