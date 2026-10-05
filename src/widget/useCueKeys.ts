import { useEffect, useRef } from 'react'
import { CUE_COUNT } from '../audio/player'

// Keys 1–5 jump to the cues, while the widget is open. Pages have their own shortcuts (YouTube's
// 1–9 jump to 10–90% of the video), and people type numbers, so a key only counts as a cue when:
// - it's 1–5 on the number row, or the number pad with Num Lock on (by the key's place, so it
//   works on any keyboard layout),
// - no modifier is held (Cmd+1 switches tabs, Shift+1 types "!", etc.),
// - nothing is being typed into (search, comments, chat), and
// - `enabled` (off during an ad: no jumping then, so the key is left to the page).
// Such keys are kept from the page, set or not, so 2 without a cue 2 doesn't jump YouTube to 20%.
// Holding a key doesn't repeat it; separate quick presses each count.
// The listener runs before the page's own (it's first in line, on the window), which was checked
// on youtube.com with scripts/check-extension.mjs (key:Digit2).

const slotOf = (e: KeyboardEvent): number | null => {
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)
  if (!match) return null
  if (e.code.startsWith('Numpad') && !/^[1-9]$/.test(e.key)) return null // Num Lock off: the pad's arrows etc.
  const slot = Number(match[1]) - 1
  return slot < CUE_COUNT ? slot : null
}

const isTyping = (e: KeyboardEvent) => {
  // The element really pressed on, even inside a shadow root (e.g. the widget's own).
  const target = e.composedPath()[0]
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file', 'image'].includes(target.type)
  return ['textbox', 'searchbox', 'combobox'].includes(target.getAttribute('role') ?? '')
}

const hasModifier = (e: KeyboardEvent) => e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.getModifierState('AltGraph')

// onPress: a cue key was pressed (not repeats from holding it).
export function useCueKeys(enabled: boolean, onPress: (slot: number) => void) {
  const latest = useRef({ enabled, onPress })
  latest.current = { enabled, onPress }

  useEffect(() => {
    const down = new Set<string>() // keys we took, so their release is kept from the page too

    const onKeyDown = (e: KeyboardEvent) => {
      const slot = slotOf(e)
      if (slot === null || !latest.current.enabled || hasModifier(e) || e.isComposing || isTyping(e)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      down.add(e.code)
      if (!e.repeat) latest.current.onPress(slot)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (!down.delete(e.code)) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [])
}
