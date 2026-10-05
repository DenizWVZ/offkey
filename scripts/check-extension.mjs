// Checks the built extension on real YouTube, in an invisible, muted copy of Chrome.
// Used by Claude, like check-playback.mjs is for the playground. Build first: npm run build:ext
//
// Run:
//   npm run check:ext -- <video address> <steps…>
//   npm run check:ext -- https://www.youtube.com/watch?v=dQw4w9WgXcQ play wait:4000 report "set:setSemitones(3)" report
//
// Opens the video, declines the cookie screen if one shows, shows the widget, then runs the steps in order:
//   wait:<ms>       wait
//   play / pause    play or pause the video (like YouTube's own button)
//   report          print the player's state: time, playing/audible, key, speed, vocals, spectrum
//   set:<call>      call the player, e.g. set:setSemitones(-3)  set:seek(60)
//   next            go to the next video (like YouTube's autoplay)
//   toggle          hide or show the widget, like clicking the toolbar icon
//   closed          (first step only) don't show the widget at the start; `toggle` shows it later
//   reload-extension  reload the extension, like the reload button in chrome://extensions
//   bg:<js>         run JavaScript in the extension's background, e.g. to change its saved settings
//   eval:<js>       print the result of any JavaScript on the page
//   widget:<js>     same, inside the widget script, e.g. widget:JSON.stringify(__audio.debug())
//   key:<code>      a real key press, e.g. key:Digit1  key:Meta+Digit1
//   click:<css>     a real mouse click on an element in the widget, e.g. click:[aria-label="Set cue 1 here"]
//   shot:<name>     save a screenshot of the widget's corner, prints the file path
// Ads play like on a normal visit; the report says when one is showing.
//
// Uses only Node and Google Chrome; nothing to install.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// EXTENSION=<folder> checks another copy, e.g. an unzipped test version from `npm run zip`.
const EXTENSION = process.env.EXTENSION ?? new URL('../dist-extension', import.meta.url).pathname
const [video = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', ...steps] = process.argv.slice(2)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const profile = mkdtempSync(join(tmpdir(), 'offkey-ext-check-'))
const shots = mkdtempSync(join(tmpdir(), 'offkey-ext-shots-'))
// Talks to Chrome over a pipe: the only way branded Chrome lets a script load an unpacked extension.
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-pipe',
  '--enable-unsafe-extension-debugging',
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio', // sound is still processed and measured, just not played out loud
  '--window-size=1400,900',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })

let id = 0
let buffer = ''
const pending = {}
const events = []
chrome.stdio[4].on('data', (data) => {
  buffer += data
  for (let end; (end = buffer.indexOf('\0')) >= 0; buffer = buffer.slice(end + 1)) {
    const message = JSON.parse(buffer.slice(0, end))
    if (message.id && pending[message.id]) {
      pending[message.id](message)
      delete pending[message.id]
    } else events.push(message)
  }
})
const send = (method, params = {}, sessionId) =>
  new Promise((resolve) => {
    pending[++id] = resolve
    chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0')
  })

try {
  const loaded = await send('Extensions.loadUnpacked', { path: EXTENSION })
  if (!loaded.result) throw new Error(`could not load the extension: ${JSON.stringify(loaded.error)}`)
  const extensionId = loaded.result.id
  const { result: { targetId } } = await send('Target.createTarget', { url: video })
  await send('Target.activateTarget', { targetId }) // the active tab, as when clicking the toolbar
  const { result: { sessionId: page } } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Runtime.enable', {}, page)

  // On the page itself…
  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, page)
    return result?.result?.value ?? result?.exceptionDetails?.exception?.description
  }
  // …and inside the widget script, where the player is (window.__player, see content.tsx).
  const inWidget = async (expression) => {
    const context = events.findLast((e) => e.method === 'Runtime.executionContextCreated' && e.sessionId === page && e.params.context.origin === `chrome-extension://${extensionId}`)
    if (!context) return '(widget script not running)'
    const { result } = await send('Runtime.evaluate', { expression, contextId: context.params.context.id, awaitPromise: true, returnByValue: true }, page)
    return result?.result?.value ?? result?.exceptionDetails?.exception?.description
  }

  await sleep(5000)
  await evaluate(`[...document.querySelectorAll('button')].find((b) => /Reject all/.test(b.textContent))?.click()`)
  await sleep(3000)

  // Show the widget, as a click on the toolbar icon would.
  // The extension's background, where toolbar clicks are handled.
  let worker
  const attachBackground = async () => {
    for (let i = 0; i < 20; i++) {
      const { result: { targetInfos } } = await send('Target.getTargets')
      const background = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(extensionId))
      if (background) return (worker = (await send('Target.attachToTarget', { targetId: background.targetId, flatten: true })).result.sessionId)
      await sleep(250)
    }
    throw new Error('extension background not found')
  }
  await attachBackground()
  const toggle = `chrome.tabs.query({ active: true }).then(([tab]) => onToolbarClick(tab))`
  // A first step `closed` leaves the widget shut (e.g. to check the audio tap before it's ever opened).
  if (steps[0] === 'closed') steps.shift()
  else {
    await send('Runtime.evaluate', { expression: toggle, awaitPromise: true }, worker)
    await sleep(1500)
  }

  const media = `document.querySelector('video.html5-main-video') ?? document.querySelector('video')`
  for (const step of steps) {
    const [name, ...rest] = step.split(':')
    const arg = rest.join(':')
    if (name === 'wait') await sleep(Number(arg))
    else if (name === 'play') await evaluate(`${media}.play()`)
    else if (name === 'pause') await evaluate(`${media}.pause()`)
    else if (name === 'next') await evaluate(`document.querySelector('.ytp-next-button')?.click()`)
    else if (name === 'bg') console.log(`${step}:`.slice(0, 40), JSON.stringify((await send('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true }, worker)).result?.result?.value))
    else if (name === 'reload-extension') {
      const reloaded = await send('Extensions.loadUnpacked', { path: EXTENSION }) // same folder: same extension, reloaded
      if (reloaded.result?.id !== extensionId) throw new Error(`reload failed: ${JSON.stringify(reloaded.error ?? reloaded.result)}`)
      await sleep(1000)
      await attachBackground()
    } else if (name === 'toggle') await send('Runtime.evaluate', { expression: toggle, awaitPromise: true }, worker)
    else if (name === 'key') {
      // A real key press, e.g. key:Digit1 or key:Shift+Digit1 (modifiers: Alt, Ctrl, Meta, Shift).
      const parts = arg.split('+')
      const code = parts.pop()
      const modifiers = parts.reduce((sum, m) => sum | { Alt: 1, Ctrl: 2, Meta: 4, Shift: 8 }[m], 0)
      const named = { Space: [' ', 32], Tab: ['Tab', 9], Enter: ['Enter', 13], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39] }[code]
      const key = named?.[0] ?? (/^(Digit|Numpad)\d$/.test(code) ? code.slice(-1) : code.replace(/^Key/, '').toLowerCase())
      const common = { code, key, modifiers, windowsVirtualKeyCode: named?.[1] ?? key.toUpperCase().charCodeAt(0) }
      await send('Input.dispatchKeyEvent', { type: 'keyDown', text: modifiers || (named && code !== 'Space') ? undefined : key, ...common }, page)
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...common }, page)
    } else if (name === 'click') {
      const at = await evaluate(`(() => { const host = [...document.body.children].find((e) => e.shadowRoot); const r = host?.shadowRoot.querySelector(${JSON.stringify(arg)})?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null })()`)
      if (!at) console.log(`click:    nothing matches ${arg}`)
      else for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 }, page)
    } else if (name === 'widget') console.log('widget:  ', JSON.stringify(await inWidget(arg)))
    else if (name === 'set') console.log(`${step}:`, await inWidget(`String(window.__player.${arg})`))
    else if (name === 'eval') console.log('eval:    ', JSON.stringify(await evaluate(arg)))
    else if (name === 'report') {
      const state = await inWidget(`(() => {
        const s = window.__player.getState()
        return { time: +s.currentTime.toFixed(1), duration: +s.duration.toFixed(1), playing: s.isPlaying, audible: s.isAudible,
          semitones: s.semitones, rate: s.rate, vocals: s.vocals,
          spectrum: window.__player.getSpectrum(8).map((v) => +v.toFixed(2)).join(' '), latency: window.__player.getLatency() }
      })()`)
      const where = await evaluate(`({ video: new URLSearchParams(location.search).get('v'), ad: !!document.querySelector('.ad-showing') })`)
      console.log('report:  ', typeof state === 'string' ? state : JSON.stringify({ ...where, ...state }))
    } else if (name === 'shot') {
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 700, height: 600, scale: 1 } }, page)
      const file = join(shots, `${arg || 'shot'}.png`)
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
      console.log('shot:    ', file)
    } else console.log(`unknown step: ${step}`)
  }

  const problems = events
    .filter((e) => e.sessionId === page && (e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(e.params.type))))
    .map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.args.map((a) => a.value ?? a.description).join(' '))
    .filter((text) => /\[(player|sound|separation|youtube audio)\]|chrome-extension:/.test(text))
  console.log('errors:  ', problems.length ? problems.join('\n          ') : 'none')
} finally {
  chrome.kill()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}
