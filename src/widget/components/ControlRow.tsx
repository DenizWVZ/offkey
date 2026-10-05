import { useGlide } from '../useGlide'
import { DotSlider } from './DotSlider'
import { ValueBadge } from './ValueBadge'
import styles from './ControlRow.module.css'

type Props = {
  label: string
  value: number // step from center, -range … +range
  format: (step: number) => string // badge text for a step, e.g. "+2" or "−15"
  onChange: (step: number) => void
  range?: number
  disabled?: boolean // dimmed, can't be changed, badge shows "–" (e.g. during an ad)
}

// One adjustable setting: label, dot slider, and the current value (click it to reset).
// When the value changes by itself (a new song resets it) or through the badge, the dots and
// the badge glide there one step at a time. Changes made on the slider show right away.
export function ControlRow({ label, value, format, onChange, range, disabled = false }: Props) {
  const shown = useGlide(disabled ? 0 : value, 'steps') // while disabled, the dots rest at the center
  const text = disabled ? '–' : format(shown.value)

  // Changes from the slider itself: shown right away, no glide.
  const onSlide = (step: number) => {
    shown.skipGlideTo(step)
    onChange(step)
  }

  return (
    <div className={`${styles.row} ${disabled ? styles.disabled : ''}`} inert={disabled}>
      <span className={styles.label}>{label}</span>
      <div className={styles.control}>
        <DotSlider label={label} value={shown.value} valueText={text} onChange={onSlide} range={range} />
        <ValueBadge text={text} changed={shown.value !== 0} resetLabel={`Reset ${label}`} onReset={() => onChange(0)} />
      </div>
    </div>
  )
}
