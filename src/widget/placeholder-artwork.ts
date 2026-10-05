import { LOGO_PATH } from './components/Header'

// Neutral stand-in artwork for pages that play a local file (the demo and the playground):
// the widget's gray with the logo.
export const PLACEHOLDER_ARTWORK =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#D9D9D9"/><g transform="translate(36 36)" fill="#B3B3B3"><path d="${LOGO_PATH}"/></g></svg>`,
  )
