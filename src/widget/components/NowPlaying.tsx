import type { ReactNode } from 'react'
import { DotSpectrum } from './DotSpectrum'
import { ScrollingTitle } from './ScrollingTitle'
import styles from './NowPlaying.module.css'

export type Track = {
  artist: string
  title: string
  artwork: string // image URL
}

type Props = {
  track: Track
  isAudible: boolean // for the spectrum: sound is coming out (not paused, not waiting for the next song)
  readSpectrum?: (bands: number) => number[] // live levels for the dot spectrum
  children?: ReactNode // the player bar and buttons, under the artwork row
}

// Top panel: artwork, the dot spectrum, artist + title, and the player controls underneath.
export function NowPlaying({ track, isAudible, readSpectrum, children }: Props) {
  return (
    <div className={styles.panel}>
      <div className={styles.top}>
        <img className={styles.artwork} src={track.artwork} alt="" />
        <div className={styles.info}>
          <DotSpectrum active={isAudible} readLevels={readSpectrum} />
          <div className={styles.metadata}>
            <p className={styles.artist}>{track.artist}</p>
            <ScrollingTitle className={styles.title} text={track.title} />
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
