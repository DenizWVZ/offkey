// Design tokens: the one place to tune how the widget looks and moves.
// Values come from the Figma frame "Music Player Widget" (131:19405; earlier: "Widget Mock" 69:86). Sizes are in px.
// Every token becomes a CSS variable on the widget root, e.g.
// color.accent → var(--color-accent), size.panelHeight → var(--size-panel-height).

export const color = {
  surface: '#FFFFFF', // the white card
  panel: '#F0F0F0', // gray panels inside the card
  accent: '#F67328', // orange: active slider dots, focus rings
  spectrum: '#FD913D', // spectrum dots (a lighter orange)
  badgeActive: '#FD913D', // value badge away from zero
  text: 'rgba(0, 0, 0, 0.8)', // track title, badge value when active
  textMuted: 'rgba(0, 0, 0, 0.58)', // artist, row labels, badge value at zero
  dot: '#B3B3B3', // slider dots
  dotCenter: '#595959', // slider center dot
  progressFill: '#595959', // player bar: the played part, and its handle
  progressTrack: '#B3B3B3', // player bar: the rest
  playButton: '#FF8133', // play/pause button
  playButtonHover: '#F57628',
  playIcon: '#3F240F', // play/pause icon
  transportButton: '#D9D9D9', // previous / next buttons
  transportButtonHover: '#CCCCCC',
  transportIcon: '#5B5B5B',
  badge: '#D9D9D9', // value badge at zero
  sliderFill: '#D9D9D9', // Speed / Vocals sliders: the filled part; header: the close button under the pointer
  sliderTick: 'rgba(0, 0, 0, 0.12)', // Speed / Vocals: tick marks at every tenth, shown on hover
  handle: '#595959', // the bar at a slider's edge (Speed, Vocals, player bar)
  glowBase: '#FF8133, #FFB27A, #FF6F61, #FF7AB6, #FFB27A, #FF8133', // Vocals glow: the hues drifting along the edges (first = last, so it loops)
  glowPoolA: '#FF8FF6', // Vocals glow: a soft pink pool wandering through
  glowPoolB: '#FFCD61', // Vocals glow: a golden pool wandering the other way
  logo: '#B3B3B3', // header: the logo (the toolbar icons use a darker grey, see store/Icon.svg)
  closeButton: '#F0F0F0', // header: close button fill (same gray as the panels)
  closeIcon: '#595959', // header: the × on the close button
  cue1: '#F471B7', // Cues: one colour per cue (dot, collapsed-row dot and player bar marker)
  cue2: '#A8E709',
  cue3: '#EBC20F',
  cue4: '#43D6FF',
  cue5: '#C47BED',
  cueEmpty: '#D9D9D9', // Cues: a cue that isn't set
  cueEmptyHover: '#A3A3A3', // Cues: an unset cue under the pointer (also right after clearing one)
  cueCaret: '#595959', // Cues: the open / close caret (the dark grey of the slider handles, Pitch center dot and player bar)
}

export const space = {
  cardPadding: 16, // sides and bottom
  cardPaddingTop: 14,
  headerGap: 14, // header ↔ first panel (the header's bottom padding)
  logoLeft: 2, // header: nudges the logo in from the left edge
  cardGap: 16, // between panels
  nowPlayingPadding: 16, // player panel: top, left and right
  nowPlayingPaddingBottom: 14, // player panel: bottom
  nowPlayingGap: 18, // artwork ↔ track info
  nowPlayingRowGap: 20, // artwork row ↔ player bar
  metadataGap: 4, // artist ↔ title
  titleLoopGap: 40, // long title scrolling: space between the end of the title and its start coming round again
  metadataBottom: 2, // small lift of the text off the panel's bottom edge
  spectrumGap: 3, // between dots in the spectrum, both directions
  playerGap: 16, // player bar ↔ times and buttons
  transportGap: 16, // between previous, play/pause and next
  rowPaddingLeft: 16, // Pitch row: label ↔ the row's left edge (same as Speed, Vocals, Cues)
  rowPaddingRight: 14, // Pitch row: value badge ↔ the row's right edge
  sliderBadgeGap: 28, // dot slider ↔ value badge
  fillHandleInset: 8, // Speed / Vocals: handle ↔ the fill's right edge
  sliderLabelLeft: 16, // Speed / Vocals / Cues: label ↔ the row's left edge
  sliderValueRight: 20, // Speed / Vocals: number ↔ the row's right edge
  handleDodgeBuffer: 8, // Speed / Vocals: the handle starts dodging this close to the label or number (as in DialKit)
  cuesSide: 16, // Cues: the cue dots ↔ the panel's left and right edges (the dots spread out evenly between)
  cuesTop: 6, // Cues: the header ↔ the cue dots
  cuesBottom: 18, // Cues: the cue dots ↔ the panel's bottom edge
  cueMiniGap: 8, // Cues, collapsed: between the small dots of set cues
  cueMiniCaretGap: 12, // Cues, collapsed: the small dots ↔ the caret
  cueMarkerStack: 3, // player bar: markers at the same spot are nudged this far apart, so the ones underneath show
  cueTimeLift: 6, // player bar: a marker's time label ↔ the bar
}

export const size = {
  widgetWidth: 360,
  panelHeight: 46,
  artwork: 96,
  titleFade: 32, // long names fade out over this width on the right (and on the left while a title scrolls)
  dot: 4,
  pill: 10, // slider dot height while hovered
  pillTall: 20, // the step under the pointer while pressing / dragging
  progressBar: 4, // player bar thickness
  progressHitArea: 20, // the grabbable height around it
  progressHandleHeight: 16, // player bar handle on hover
  playButton: 40,
  transportButton: 31,
  timeWidth: 45, // each time label (grows for songs over an hour)
  focusRing: 2, // keyboard focus outline width
  labelWidth: 56, // Pitch label box (56 centres the middle dot in the row; was 62)
  badge: 30, // value badge height, and width for one digit
  badgeWide: 36, // width for two digits, e.g. "−10"
  handleWidth: 4, // slider handle (Speed, Vocals, player bar)
  handleHeight: 24,
  glowReachX: 80, // Vocals glow: how far the light reaches in from the left and right ends
  glowReachY: 23, // Vocals glow: how far it reaches in from the top and bottom (23 = half the row: it just meets in the middle)
  handleDodgeHeight: 18, // Speed / Vocals: handle while it passes the label or number
  tickWidth: 1, // Speed: tick marks shown on hover
  tickHeight: 8,
  logo: 23, // header: logo, width and height
  headerButton: 26, // header: close button diameter
  closeIcon: 8, // header: the × inside it
  closeIconStroke: 1.9, // header: thickness of the × lines
  cueDot: 46, // Cues: cue dot diameter
  caretWidth: 10, // Cues: the caret
  caretHeight: 6,
  caretStroke: 1.6,
  cueMarker: 6, // player bar: a cue's marker dot…
  cueMarkerRing: 2, // …and the panel-coloured ring around it (the cut-out look)
  cueMarkerHitArea: 14, // player bar: the clickable area around a marker
}

export const radius = {
  card: 14,
  panel: 14,
  artwork: 8,
  fill: 12, // Speed / Vocals: the filled part
  round: 999, // fully rounded: dots, bars, badge, play button
}

export const shadow = {
  card: [
    '0 2px 15px 0 rgba(0, 0, 0, 0.25)',
    '0 16px 32px 0 rgba(12, 12, 13, 0.1)',
    '0 0.5px 3px 0 rgba(0, 0, 0, 0.2)',
    '0 4px 4px 0 rgba(12, 12, 13, 0.05)',
  ].join(', '),
}

export const font = {
  family: "'Geist', system-ui, sans-serif",
  familyMono: "'Geist Mono', ui-monospace, monospace", // times under the player bar
  weight: 500, // Medium
  sizeArtist: 12,
  sizeTitle: 15,
  sizeLabel: 14,
  sizeBadge: 14,
  sizeTime: 13,
  sizeCue: 20, // the number on a cue dot (Geist Mono)
  sizeCueTime: 11, // a marker's time label on hover
  tracking: '0.01em', // 1% of font size, as in Figma
  trackingTime: '0.03em',
  lineHeight: 1,
}

export const effect = {
  disabledOpacity: 0.45, // a control that can't be used right now (e.g. during an ad, or Vocals without separation)
  busyOpacity: 0.5, // Vocals label, handle and number while the glow shows
  glowStrength: 0.55, // Vocals glow: overall strength at its brightest
  glowBreathMin: 0.4, // Vocals glow: how far it dims on each breath (share of full strength); 1 = no breathing
  handleDodgeOpacity: 0.1, // Speed / Vocals: handle while it passes the label or number (as in DialKit)
  cueNumberShade: '42%', // Cues: the number is the cue's colour at this share, the rest black (dark pink on pink)
  cueHoverShade: '90%', // Cues: a set cue under the pointer, same idea (a little darker)
  cueFlashWhite: 0.3, // Cues: how much lighter a cue flashes when it's set or played
  cueHaloEnd: 0.65, // Cues: how faint the halo has become when the colour has shrunk away (it starts at full strength)
  cueHaloShade: '35%', // Cues: the halo shown while holding to reset is the cue's colour at this share (the rest see-through)
}

// Animation values (durations, easing, springs). Times are in milliseconds.
export const motion = {
  spectrumFallMs: 80, // time for a spectrum column to drop one dot (full column ≈ 0.4s)
  spectrumStepMs: 0, // how often the spectrum updates; 0 = every frame (smooth), ~80 = stepped / retro
  pillRippleMs: 18, // hover: delay per dot as the pills spread out from the center; 0 = all at once
  pillRippleSettleMs: 300, // hover: after the last dot's delay, how long the ripple is given to finish
  glideStepMs: 45, // Pitch / Speed gliding back to 0 (new song, badge reset): time per step
  keyNudgeMs: 500, // keyboard: how long the new step stays tall after an arrow press
  colorFadeMs: 120, // slider dots and value badge fading between gray and orange
  colorFadeEasing: 'ease-out',
  titlePauseMs: 2500, // long title: rests at its start this long before scrolling (and after each loop)
  titleScrollSpeed: 26, // long title: scrolling speed, px per second (not a time; read directly)
  glowDriftMs: 10000, // Vocals glow: the hues travelling once along the edges
  glowPoolAMs: 4500, // Vocals glow: the pink pool wandering across and back (half of this each way)
  glowPoolBMs: 7500, // Vocals glow: the golden pool (a different speed from A makes the blend repeat less)
  glowBreathMs: 1600, // Vocals glow: one breath (brighter → softer → brighter)
  glowFadeMs: 300, // Vocals glow: fading in and out
  glowShowDelayMs: 250, // Vocals glow: only shows if the work takes longer than this (no flash on quick switches)
  glowMinShowMs: 800, // Vocals glow: once shown, stays at least this long
  iconSwapMs: 140, // play ↔ pause icon cross-fade
  iconSwapScale: 0.6, // play ↔ pause: the outgoing icon shrinks to this, the incoming one grows from it
  handleHiddenScale: 0.4, // player bar handle: its size while hidden (it grows from this on hover)
  tickFadeMs: 200, // Speed: tick marks fading in and out on hover
  handleDodgeMs: 200, // Speed / Vocals: handle shortening and fading while it passes the label or number
  handleFadeMs: 150,
  buttonPressScale: 0.9, // player buttons shrink to this while pressed
  cueFlashMs: 350, // Cues: the lighter flash fading back when a cue is set or played
  cueShakeMs: 180, // Cues: the gentle shake when an unset cue's key is pressed
  cueShakePx: 2, // …and how far it moves (not a time; read directly)
  cueDoubleClickMs: 400, // Cues: a second click this soon after setting a cue is ignored (it wouldn't jump to where you just were)
  cueHoldMs: 550, // Cues: how long a set cue is held down to reset it (the pop comes at the end)
  cueEmptyInMs: 160, // Cues: after the pop, the grey empty dot settling in…
  cueEmptyInScale: 0.8, // …from this size (share of full; a small growth, much gentler than the shrinking; read directly)
  cueEmptyInOpacity: 0.2, // …and this strength (read directly)
  cueHoldGraceMs: 75, // …of which a plain tap (no halo, no shrinking yet): the shrink only starts after this
  cueHoldEndScale: 0.25, // …how small the dot has shrunk just before it pops (share of full size; read directly)
  cueHaloFadeMs: 300, // …the halo fading in when the shrinking starts, and out on release
  cueEmptyFadeMs: 60, // Cues: an empty dot's colour changing (grey ↔ darker grey on hover)
  cuePopMs: 180, // …the quick pop at the end: the dot collapses to nothing
  cueMiniFadeMs: 150, // Cues: the collapsed row's small dots fading as it opens
  caretTurnMs: 200, // Cues: the caret turning up (open) or down (closed)
  cueTimeFadeMs: 120, // player bar: a marker's time label fading in on hover
}

// The cue colours in slot order (cue 1 first).
export const cueColors = [color.cue1, color.cue2, color.cue3, color.cue4, color.cue5]

// Where the widget first appears on a web page, from the top left corner. It can be dragged from there.
// Not CSS variables: the page (not the widget) is positioned with these.
export const placement = {
  top: 16,
  left: 28,
}

// Springs for Motion (the animation library). Stiffer = faster; lower damping = more bounce.
// Not turned into CSS variables: Motion reads them directly.
export const spring = {
  pill: { stiffness: 700, damping: 32 }, // slider dot ↔ pill ↔ tall pill; slight overshoot
  handle: { stiffness: 600, damping: 32 }, // player bar handle appearing on hover
  press: { stiffness: 900, damping: 30 }, // player buttons pressed and released
  fill: { stiffness: 500, damping: 40 }, // Speed / Vocals gliding to a value set from outside (reset, new song); no overshoot
  accordion: { stiffness: 500, damping: 45 }, // Cues row opening and closing; no overshoot
  cueRelease: { stiffness: 500, damping: 30 }, // Cues: the dot growing back when a hold to reset is let go early
}

// Easing curves for Motion (cubic béziers), read directly.
export const ease = {
  cueHold: [0.5, 0.6, 0.45, 0.9], // Cues: the dot shrinking while held; fast at first, slowing toward the end (tension)
  cueEmptyIn: [0, 0, 0.2, 0.9], // Cues: the grey dot settling in after the pop
  cuePop: [1.2, 0.1, 0.2, 0.75], // Cues: the pop at the end (the colour disappearing); tuned by eye in the test panel
} as const

// ---------------------------------------------------------------------------
// Turns the tokens above into CSS variables. No need to edit below this line.

const groups = { color, space, size, radius, shadow, font, effect, motion }

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

// Numbers are px, except motion (ms) and font weight / line height / opacity (unitless).
const unitless = ['font.weight', 'font.lineHeight', 'effect.disabledOpacity', 'effect.handleDodgeOpacity', 'effect.busyOpacity', 'effect.glowStrength', 'effect.glowBreathMin', 'effect.cueFlashWhite', 'motion.buttonPressScale', 'motion.iconSwapScale', 'motion.handleHiddenScale', 'motion.cueHoldEndScale', 'motion.cueEmptyInScale', 'motion.cueEmptyInOpacity', 'effect.cueHaloEnd']
const toCss = (group: string, key: string, value: string | number) => {
  if (typeof value !== 'number' || unitless.includes(`${group}.${key}`)) return String(value)
  return group === 'motion' ? `${value}ms` : `${value}px`
}

export const cssVariables: Record<string, string> = Object.fromEntries(
  Object.entries(groups).flatMap(([group, values]) =>
    Object.entries(values as Record<string, string | number>).map(([key, value]) => [
      `--${group}-${kebab(key)}`,
      toCss(group, key, value),
    ]),
  ),
)
