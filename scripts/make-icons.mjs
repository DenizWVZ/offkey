// Makes the extension's icons from the logo (store/Icon.svg), drawn by Google Chrome (nothing to install).
//   npm run icons
// Writes src/extension/icons/icon-16/32/48/128.png (copied into the build) and store/icon-128.png (the store icon).
// Run again whenever the logo changes.

import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9335
const root = new URL('..', import.meta.url).pathname
const OUT = join(root, 'src/extension/icons')
// Empty space around the logo at each size. The store asks for 96 px artwork with 16 px around it at 128;
// the small toolbar sizes use nearly all their space so the logo stays legible.
const PADDING = { 16: 0.5, 32: 1, 48: 3, 128: 16 }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const svg = readFileSync(join(root, 'store/Icon.svg'), 'utf8')
const profile = mkdtempSync(join(tmpdir(), 'offkey-icons-'))
mkdirSync(OUT, { recursive: true })
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })

try {
  let pages
  for (let i = 0; i < 40 && !pages; i++) {
    try { pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json() } catch { await sleep(250) }
  }
  const ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve) => (ws.onopen = resolve))
  let id = 0
  const pending = {}
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data)
    if (pending[data.id]) { pending[data.id](data.result ?? data.error); delete pending[data.id] }
  }
  const send = (method, params = {}) => new Promise((resolve) => { pending[++id] = resolve; ws.send(JSON.stringify({ id, method, params })) })

  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  for (const [size, pad] of Object.entries(PADDING).map(([s, p]) => [Number(s), p])) {
    await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false })
    const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size - 2 * pad}px;height:${size - 2 * pad}px;margin:${pad}px}</style>${svg}`
    await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') })
    await sleep(300)
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } })
    writeFileSync(join(OUT, `icon-${size}.png`), Buffer.from(data, 'base64'))
    console.log(`icon-${size}.png`)
  }
  copyFileSync(join(OUT, 'icon-128.png'), join(root, 'store/icon-128.png'))
  console.log('store/icon-128.png (the store icon)')
  ws.close()
} finally {
  chrome.kill()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}
