// Checks the playground with real audio playing, in an invisible copy of Chrome.
// Used by Claude when a check needs sound (the Chrome extension's tab can't load audio while hidden).
//
// Run (with the dev server running):
//   npm run check -- song:<audio file> play wait:9000 report seek:0.5 wait:3000 report shot:middle pause report
//
// Steps, run in order:
//   song:<path>       load an audio file from this computer into the playground (start with this)
//   play / pause      click the play/pause button
//   wait:<ms>         wait
//   seek:<0–1>        click the player bar at that point (0 = start, 1 = end)
//   click:<css>:<0–1> click a point along any element, e.g. click:[aria-label=Pitch]:0.8
//   drag:<from>:<to>  press the player bar at one point, drag to another, release
//   hover:<css>:<0–1> move the pointer over a point along an element, no button held
//   press:<css>:<0–1> press and hold there, e.g. press:[aria-label=Pitch]:0.5
//   move:<css>:<0–1>  move there with the button still held (a drag in progress)
//   release           let go of the button where the pointer is
//   key:<Key>[:<css>] press a key on the player bar, or on the element given, e.g. key:ArrowRight:[aria-label=Speed]
//   report            print time, player bar fill, the times shown and spectrum dots
//   shot:<name>       save a 2x screenshot of the widget, prints the file path
//   eval:<js>         print the result of any JavaScript on the page
//
// Uses only Node and Google Chrome; nothing to install.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL ?? 'http://localhost:5173'
const PORT = 9333
const steps = process.argv.slice(2)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const profile = mkdtempSync(join(tmpdir(), 'offkey-check-'))
const shots = mkdtempSync(join(tmpdir(), 'offkey-shots-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--autoplay-policy=no-user-gesture-required',
  '--hide-scrollbars',
  '--mute-audio', // sound is still processed and measured, just not played out loud
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' })

const errors = []

try {
  // Wait for Chrome, then connect to its page.
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
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text)
    if (data.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(data.params.type)) errors.push(data.params.args.map((a) => a.value ?? a.description).join(' '))
    if (pending[data.id]) { pending[data.id](data.result ?? data.error); delete pending[data.id] }
  }
  const send = (method, params = {}) => new Promise((resolve) => { pending[++id] = resolve; ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return r.exceptionDetails ? `ERROR ${r.exceptionDetails.exception?.description}` : r.result.value
  }
  let pointer = { x: 0, y: 0 }
  let held = false
  const mouse = (type, x, y, buttons = type === 'mouseReleased' ? 0 : 1) => {
    pointer = { x, y }
    return send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: 1 })
  }
  const center = (selector) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  // A point along the player bar, 0 = start, 1 = end.
  const along = (fraction, selector = '[aria-label=Seek]') => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + ${fraction} * r.width, y: r.top + r.height / 2 } })()`)

  await send('Page.enable')
  await send('Runtime.enable')
  // Lets us read the song's position: remember the audio element when it's first played.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__media = this; return p.call(this) }' })
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 800, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: URL })
  await sleep(2500)

  const report = `(() => {
    const m = window.__media
    const seek = document.querySelector('[aria-label=Seek]')
    const track = seek.firstElementChild
    const spectrum = document.querySelector('[class*=spectrum]')
    return {
      time: m ? +m.currentTime.toFixed(1) : 0,
      duration: m ? +m.duration.toFixed(1) : null,
      playing: m ? !m.paused : false,
      button: document.querySelector('[aria-label=Play], [aria-label=Pause]').getAttribute('aria-label'),
      barFill: +(track.firstElementChild.getBoundingClientRect().width / track.getBoundingClientRect().width).toFixed(3),
      times: [...seek.nextElementSibling.querySelectorAll(':scope > span')].map((t) => t.textContent).join(' '),
      spectrumDots: [...spectrum.children].map((c) => c.children.length).join(''),
      spectrumColor: getComputedStyle(spectrum.querySelector('span')).backgroundColor,
      ...(window.__player && { semitones: __player.getState().semitones, rate: +__player.getState().rate.toFixed(2), vocals: __player.getState().vocals, vocalsAvailable: __player.getState().vocalsAvailable, latency: __player.getLatency() }),
      badges: [...document.querySelectorAll('[class*=badge]')].map((b) => b.textContent).join(' '),
    }
  })()`

  for (const step of steps) {
    const [name, ...args] = step.split(':')
    if (name === 'song') {
      // Picks the file in the playground's "Choose a song" input, as if chosen by hand.
      const { root } = await send('DOM.getDocument')
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
      await send('DOM.setFileInputFiles', { nodeId, files: [args.join(':')] })
      await sleep(1000)
    } else if (name === 'play' || name === 'pause') {
      const { x, y } = await center('[aria-label=Play], [aria-label=Pause]')
      await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y)
    } else if (name === 'wait') {
      await sleep(Number(args[0]))
    } else if (name === 'seek') {
      const { x, y } = await along(Number(args[0]))
      await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y)
    } else if (name === 'drag') {
      const from = await along(Number(args[0]))
      const to = await along(Number(args[1]))
      await mouse('mousePressed', from.x, from.y); await mouse('mouseMoved', to.x, to.y); await sleep(200)
      console.log(`mid-drag: ${JSON.stringify(await evaluate(report))}`)
      await mouse('mouseReleased', to.x, to.y)
    } else if (name === 'click') {
      const fraction = Number(args.pop())
      const { x, y } = await along(fraction, args.join(':'))
      await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y)
    } else if (name === 'hover' || name === 'press' || name === 'move') {
      const fraction = Number(args.pop())
      const { x, y } = await along(fraction, args.join(':'))
      if (name === 'press') { await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y); held = true }
      else await mouse('mouseMoved', x, y, held ? 1 : 0)
    } else if (name === 'release') {
      await mouse('mouseReleased', pointer.x, pointer.y); held = false
    } else if (name === 'key') {
      await evaluate(`document.querySelector(${JSON.stringify(args.slice(1).join(':') || '[aria-label=Seek]')}).focus()`)
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: args[0], code: args[0] })
    } else if (name === 'report') {
      console.log(`report:   ${JSON.stringify(await evaluate(report))}`)
    } else if (name === 'shot') {
      const r = await evaluate(`(() => { const r = document.querySelector('[aria-label=Seek]').closest('div[style]').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })()`)
      const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } })
      const file = join(shots, `${args[0] || 'shot'}.png`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      console.log(`shot:     ${file}`)
    } else if (name === 'eval') {
      console.log(`eval:     ${JSON.stringify(await evaluate(args.join(':')))}`)
    } else {
      console.log(`unknown step: ${step}`)
    }
  }

  console.log(`errors:   ${errors.length ? JSON.stringify(errors) : 'none'}`)
  ws.close()
} finally {
  chrome.kill()
  await sleep(500)
  rmSync(profile, { recursive: true, force: true })
}
