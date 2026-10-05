// Lets the widget be moved around the page: press anywhere on it that isn't a control and drag.
// It always stays fully on screen, also when the window gets smaller.

export type Position = { left: number; top: number }

// Anything the widget uses for its own clicks and drags.
const CONTROLS = 'button, a, input, [role="slider"]'

export function makeDraggable(host: HTMLElement, onMoved: (position: Position) => void) {
  const place = (left: number, top: number) => {
    const { width, height } = host.getBoundingClientRect()
    left = Math.round(Math.max(0, Math.min(left, innerWidth - width)))
    top = Math.round(Math.max(0, Math.min(top, innerHeight - height)))
    host.style.left = `${left}px`
    host.style.top = `${top}px`
    return { left, top }
  }

  host.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    if (e.composedPath().some((el) => el instanceof Element && el.matches(CONTROLS))) return
    e.preventDefault() // no text selection while dragging
    const start = host.getBoundingClientRect()
    const offsetX = e.clientX - start.left
    const offsetY = e.clientY - start.top
    host.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => place(ev.clientX - offsetX, ev.clientY - offsetY)
    const end = () => {
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerup', end)
      host.removeEventListener('pointercancel', end)
      const { left, top } = host.getBoundingClientRect()
      onMoved({ left, top })
    }
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerup', end)
    host.addEventListener('pointercancel', end)
  })

  const keepOnScreen = () => {
    const { left, top } = host.getBoundingClientRect()
    place(left, top)
  }
  addEventListener('resize', keepOnScreen)
  // Also when the widget first gets its size (it has none until drawn) or changes size.
  const sizeWatcher = new ResizeObserver(keepOnScreen)
  sizeWatcher.observe(host)

  return {
    place,
    stop: () => {
      removeEventListener('resize', keepOnScreen)
      sizeWatcher.disconnect()
    },
  }
}
