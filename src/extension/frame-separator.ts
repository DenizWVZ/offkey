// Vocal separation on a page like YouTube: its security rules block the widget script from starting
// a background worker, so the model runs in a hidden frame owned by the extension (separator.html)
// instead. This looks like a worker to the separation engine: same messages, passed through a
// message channel into the frame.

import type { Separator } from '../audio/player'

export function startFrameSeparator(): Separator {
  const channel = new MessageChannel()
  const frame = document.createElement('iframe')
  frame.src = chrome.runtime.getURL('src/extension/separator.html')
  frame.style.display = 'none'
  // Once the frame has loaded, hand it its end of the channel. Messages sent before then wait.
  frame.addEventListener('load', () => frame.contentWindow?.postMessage({ type: 'offkey-connect' }, '*', [channel.port2]), { once: true })
  document.documentElement.append(frame)

  const separator: Separator = {
    postMessage: (message, transfer = []) => channel.port1.postMessage(message, transfer),
    onmessage: null,
  }
  channel.port1.onmessage = (event) => separator.onmessage?.(event)
  return separator
}
