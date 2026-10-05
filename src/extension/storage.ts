// The extension's own storage, safe to call from a widget script that has been cut off.
// After the extension is reloaded or updated, YouTube tabs that were already open keep running the
// old widget script, which can no longer reach the extension. Chrome then throws "Extension context
// invalidated" on every storage call (shown as an error on chrome://extensions). These skip quietly
// instead: nothing can be saved from that tab until it refreshes (the toolbar button does that).

const connected = () => {
  try {
    return chrome.runtime?.id !== undefined
  } catch {
    return false
  }
}

export async function readStored<T>(key: string): Promise<T | undefined> {
  if (!connected()) return undefined
  try {
    return (await chrome.storage.local.get(key))[key] as T | undefined
  } catch {
    return undefined
  }
}

export async function store(key: string, value: unknown) {
  if (!connected()) return
  try {
    await chrome.storage.local.set({ [key]: value })
  } catch {
    // cut off in the meantime; see above
  }
}
