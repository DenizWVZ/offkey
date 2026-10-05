// Runs in Chrome's background. Clicking the toolbar icon shows or hides the widget on that tab.
//
// A YouTube tab that was open when the extension was reloaded or updated keeps the old widget
// script, cut off from the extension, and it can't be restarted in place: the video's sound may
// already be routed through the old one, and the audio tap only starts with a page load.
// So when no widget script answers on a YouTube tab, the tab is refreshed and the widget opened
// once it has loaded.

const PAGES = /^https:\/\/(www|music)\.youtube\.com\//
const OPEN_AFTER_LOAD_KEY = 'openAfterLoad' // tabs to open the widget in once they've loaded
const TRIES = 10 // the widget script starts a moment after the page has loaded
const TRY_EVERY_MS = 300

const toggle = (tabId: number) => chrome.tabs.sendMessage(tabId, { type: 'toggle' })

async function onToolbarClick(tab: chrome.tabs.Tab) {
  if (tab.id === undefined || !PAGES.test(tab.url ?? '')) return
  try {
    await toggle(tab.id)
  } catch {
    // Kept in session storage, since Chrome may put this background to sleep while the tab loads.
    const waiting = await openAfterLoad()
    await chrome.storage.session.set({ [OPEN_AFTER_LOAD_KEY]: [...waiting, tab.id] })
    await chrome.tabs.reload(tab.id)
  }
}

async function openAfterLoad(): Promise<number[]> {
  return ((await chrome.storage.session.get(OPEN_AFTER_LOAD_KEY))[OPEN_AFTER_LOAD_KEY] as number[] | undefined) ?? []
}

chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (change.status !== 'complete') return
  const waiting = await openAfterLoad()
  if (!waiting.includes(tabId)) return
  await chrome.storage.session.set({ [OPEN_AFTER_LOAD_KEY]: waiting.filter((id) => id !== tabId) })
  for (let i = 0; i < TRIES; i++) {
    try {
      return await toggle(tabId)
    } catch {
      await new Promise((resolve) => setTimeout(resolve, TRY_EVERY_MS))
    }
  }
  console.warn('[offkey] the widget script did not start after refreshing the tab')
})

chrome.action.onClicked.addListener(onToolbarClick)
Object.assign(globalThis, { onToolbarClick }) // for checks (scripts), which can't click the toolbar
