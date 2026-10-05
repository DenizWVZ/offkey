import type { Cues } from '../audio/player'
import { readStored, store } from './storage'

// Remembers Pitch, Speed, Vocals and the cues for recent songs (by YouTube video id), so going back to
// a song brings its settings back. A few numbers per song, kept in the extension's own storage.

export type SongSettings = { semitones: number; rate: number; vocals: number; cues: Cues }
type Saved = SongSettings & { at: number } // at: when last changed, to forget the oldest

const KEY = 'songSettings'
const KEEP_SONGS = 50
const SAVE_AFTER_MS = 500 // wait for a drag to settle before saving

// A song with no remembered settings: original key, normal speed, vocals as released, no cues.
export const DEFAULT_SETTINGS: SongSettings = { semitones: 0, rate: 1, vocals: 100, cues: [] }

const isDefault = (s: SongSettings) =>
  s.semitones === DEFAULT_SETTINGS.semitones && s.rate === DEFAULT_SETTINGS.rate && s.vocals === DEFAULT_SETTINGS.vocals && s.cues.every((cue) => cue === null)

async function readAll(): Promise<Record<string, Saved>> {
  return (await readStored<Record<string, Saved>>(KEY)) ?? {}
}

export async function loadSongSettings(id: string): Promise<SongSettings | null> {
  const saved = (await readAll())[id]
  return saved ? { ...DEFAULT_SETTINGS, ...saved } : null // saved before cues existed: no cues
}

async function save(id: string, settings: SongSettings) {
  const all = await readAll()
  if (isDefault(settings)) delete all[id]
  else all[id] = { ...settings, at: Date.now() }
  // Forget the oldest beyond the limit.
  const ids = Object.keys(all).sort((a, b) => all[b].at - all[a].at)
  for (const old of ids.slice(KEEP_SONGS)) delete all[old]
  await store(KEY, all)
}

// Returns a function to call whenever a song's settings change; it saves them shortly after.
export function rememberSongSettings() {
  let waiting: { id: string; settings: SongSettings; timer: ReturnType<typeof setTimeout> } | null = null
  let last = ''
  const saveNow = () => {
    if (!waiting) return
    clearTimeout(waiting.timer)
    void save(waiting.id, waiting.settings)
    waiting = null
  }
  return (id: string, settings: SongSettings) => {
    const key = JSON.stringify([id, settings])
    if (key === last) return
    last = key
    if (waiting && waiting.id !== id) saveNow() // a different song: don't lose the last one's change
    if (waiting) clearTimeout(waiting.timer)
    waiting = { id, settings, timer: setTimeout(saveNow, SAVE_AFTER_MS) }
  }
}
