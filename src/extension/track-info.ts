// What's playing, for the widget's title, artist and artwork. Read from the "now playing" info that
// YouTube and YouTube Music give the browser for media keys and the lock screen, so no digging in
// their page layout. Falls back to the page title and the video's thumbnail.

import type { Track } from '../widget/components/NowPlaying'

const CHECK_EVERY_MS = 1000

// The video's id from the address (?v=…), or null when there isn't one.
export const videoId = () => new URLSearchParams(location.search).get('v')

function read(): Track {
  const metadata = navigator.mediaSession?.metadata
  const id = videoId()
  // Artwork comes in several sizes, usually smallest first; take the largest.
  const largest = [...(metadata?.artwork ?? [])].sort((a, b) => area(b.sizes) - area(a.sizes))[0]
  return {
    title: metadata?.title || document.title.replace(/ - YouTube( Music)?$/, ''),
    artist: metadata?.artist || '',
    artwork: largest?.src ?? (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''),
  }
}

// "96x96 128x128" → the largest width × height.
const area = (sizes = '') => Math.max(0, ...sizes.split(' ').map((size) => size.split('x').map(Number).reduce((w, h) => w * h || 0)))

// Calls onChange whenever the track info changes. Returns a function to stop watching.
export function watchTrack(media: HTMLMediaElement, onChange: (track: Track) => void) {
  let last = ''
  const check = () => {
    const track = read()
    const key = JSON.stringify(track)
    if (key === last) return
    last = key
    onChange(track)
  }
  check()
  const events = ['loadedmetadata', 'play']
  events.forEach((event) => media.addEventListener(event, check))
  const timer = setInterval(check, CHECK_EVERY_MS) // the page updates its info a moment after a song starts
  return () => {
    clearInterval(timer)
    events.forEach((event) => media.removeEventListener(event, check))
  }
}

// Calls onChange when a different video starts (a new ?v= in the address), e.g. clicking another
// video or autoplay moving on. Leaving for a page without a video (and coming back) doesn't count.
export function watchVideoChange(onChange: () => void) {
  let last = videoId()
  setInterval(() => {
    const id = videoId()
    if (id && id !== last) {
      last = id
      onChange()
    }
  }, CHECK_EVERY_MS / 4)
}
