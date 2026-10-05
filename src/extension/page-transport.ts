// Previous / next song, done with the page's own buttons, so the site decides what "next" is
// (YouTube's up-next or playlist, YouTube Music's queue).

const isMusic = () => location.hostname === 'music.youtube.com'

// Judged by the button's own "disabled" marks, not by whether it shows: YouTube hides its next
// button in small players but keeps it working.
const usable = (el: HTMLElement | null): el is HTMLElement =>
  el !== null && el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('disabled')

const nextButton = () =>
  document.querySelector<HTMLElement>(isMusic() ? 'ytmusic-player-bar .next-button' : '.html5-video-player .ytp-next-button')

const previousButton = () =>
  document.querySelector<HTMLElement>(isMusic() ? 'ytmusic-player-bar .previous-button' : '.html5-video-player .ytp-prev-button')

// Undefined when the page has no next song (the widget then dims its button).
export function pageNext(): (() => void) | undefined {
  return usable(nextButton()) ? () => nextButton()?.click() : undefined
}

// Only asked for near the start of a song (further in, the widget restarts the song itself).
// YouTube shows a previous button only in playlists; otherwise go back to the page before.
export function pagePrevious() {
  const button = previousButton()
  if (usable(button)) button.click()
  else if (!isMusic()) history.back()
}
