import { useEffect, useState } from 'react'
import type { Player } from '../audio/player'
import { CueControls } from './CueControls'
import { GlowControls } from './GlowControls'
import type { Network } from './stream-simulator'
import styles from './TestPanel.module.css'

type Props = {
  player: Player
  setNetwork?: (network: Network) => void // playground only: the simulated network
  downloadedAhead?: () => number // defaults to what vocal separation has received
  docked?: boolean // sits in the page flow (under the widget in the extension), not floating
}

type Choice<T extends string | number> = { label: string; options: [T, string][]; value: T; onChange: (value: T) => void }

function Switch<T extends string | number>({ label, options, value, onChange }: Choice<T>) {
  return (
    <div className={styles.switch}>
      <span>{label}</span>
      <div>
        {options.map(([option, text]) => (
          <button key={String(option)} className={option === value ? styles.on : ''} onClick={() => onChange(option)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

// While tuning the cue dots, show only their controls. Set to false to bring back the vocals switches, numbers and the Glow controls.
const CUES_ONLY = true

const seconds = (n: unknown) => `${Number(n ?? 0).toFixed(1)} s`

// Live numbers and switches for trying out vocal separation under streaming, plus live glow tuning.
// Playground (?test) and the extension's dev build.
export function TestPanel({ player, setNetwork, downloadedAhead, docked = false }: Props) {
  const [debug, setDebug] = useState<Record<string, number | string> | null>(null)
  const [storage, setStorage] = useState<'recent' | 'song'>('recent')
  const [whenNotReady, setWhenNotReady] = useState<'fade' | 'pause'>('fade')
  const [network, setNetworkState] = useState<Network>('normal')
  const [slowdown, setSlowdown] = useState(1)

  useEffect(() => {
    const timer = setInterval(() => setDebug(player.getVocalsDebug()), 250)
    return () => clearInterval(timer)
  }, [player])

  const status = debug?.status === 'idle' ? 'not used yet (move Vocals below 100)' : String(debug?.status ?? '')
  const rows: [string, string][] = [
    ['Status', status],
    ['Playing', debug?.route === 'separated' ? 'separated (vocals adjustable)' : 'original'],
    ['Downloaded ahead', seconds(downloadedAhead ? downloadedAhead() : debug?.downloadedAhead)],
    ['Separated ahead', seconds(debug?.separatedAhead)],
    ['Separation speed', debug?.segmentSpeed ? `${Number(debug.segmentSpeed).toFixed(1)}× playback` : '–'],
    ['Runs on', debug?.backend === 'webgpu' ? 'graphics chip' : debug?.backend === 'wasm' ? 'processor' : '–'],
    ['Separated, in memory', `${seconds(debug?.separatedSeconds)} · ${Number(debug?.memoryMB ?? 0).toFixed(0)} MB`],
    ['Song audio, in memory', `${Number(debug?.songMB ?? 0).toFixed(0)} MB`],
  ]

  return (
    <div className={`${styles.panel} ${docked ? styles.docked : ''}`}>
      {!CUES_ONLY && (
        <>
        <h2>Vocals test panel</h2>
        <dl>
          {rows.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <Switch label="Remember" value={storage} options={[['recent', 'Last 60 s'], ['song', 'This song']]} onChange={(v) => { setStorage(v); player.setVocalsOptions({ storage: v }) }} />
        <Switch label="While not ready" value={whenNotReady} options={[['fade', 'Play, then fade'], ['pause', 'Pause']]} onChange={(v) => { setWhenNotReady(v); player.setVocalsOptions({ whenNotReady: v }) }} />
        {setNetwork && <Switch label="Network" value={network} options={[['normal', 'Normal'], ['slow', 'Slow']]} onChange={(v) => { setNetworkState(v); setNetwork(v) }} />}
        <Switch label="Computer" value={slowdown} options={[[1, 'This Mac'], [4, '4× slower']]} onChange={(v) => { setSlowdown(v); player.setVocalsOptions({ slowdown: v }) }} />
        </>
      )}
      <CueControls />
      {!CUES_ONLY && <GlowControls />}
    </div>
  )
}
