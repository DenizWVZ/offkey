import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { motion as timing, size, space } from '../tokens'
import styles from './ScrollingTitle.module.css'

type Props = {
  text: string
  className?: string // font size and colour
}

// A title that fits stays still. One that doesn't rests at its start, then scrolls left at an
// even speed until its start comes round again (a second copy follows it), rests, and repeats.
export function ScrollingTitle({ text, className = '' }: Props) {
  const boxRef = useRef<HTMLParagraphElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const copyRef = useRef<HTMLSpanElement>(null) // the second copy that follows the title round
  const [overflow, setOverflow] = useState(0) // how wide the text is, when it doesn't fit; 0 = fits
  const x = useMotionValue(0)
  const distanceRef = useRef(0) // how far this loop scrolls
  // Left-edge fade: always full strength, but only as wide as the text has travelled (up to the
  // fade's width), so letters leaving the edge never look cut off. It narrows the same way as the
  // title's start lands back in place, and is gone the moment it arrives.
  const leftFade = useTransform(x, (v) => {
    const travelled = -v
    return Math.max(0, Math.min(1, travelled / size.titleFade, (distanceRef.current - travelled) / size.titleFade))
  })
  const reduceMotion = useReducedMotion()

  // Measure when the title changes, the box is resized, or the text changes width (e.g. once the
  // font has loaded: on YouTube it arrives after the widget first shows).
  useLayoutEffect(() => {
    const box = boxRef.current
    const measure = () => {
      const width = textRef.current?.offsetWidth ?? 0
      setOverflow(box && width > box.clientWidth ? width : 0)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (box) observer.observe(box)
    if (textRef.current) observer.observe(textRef.current)
    return () => observer.disconnect()
  }, [text])

  useEffect(() => {
    x.set(0)
    if (!overflow || reduceMotion) return
    let stopped = false
    let timer = 0
    let scroll: ReturnType<typeof animate> | null = null

    const loop = () => {
      timer = window.setTimeout(() => {
        if (stopped) return
        // Measured now, not in advance, so it always lands exactly where the copy starts.
        const distance = copyRef.current?.offsetLeft ?? overflow + space.titleLoopGap
        distanceRef.current = distance
        scroll = animate(x, -distance, {
          duration: distance / timing.titleScrollSpeed,
          ease: 'linear',
          onComplete: () => {
            x.set(0) // the second copy is now where the first started: swap back unnoticed
            if (!stopped) loop()
          },
        })
      }, timing.titlePauseMs)
    }
    loop()
    return () => {
      stopped = true
      clearTimeout(timer)
      scroll?.stop()
    }
  }, [overflow, reduceMotion, text, x])

  return (
    <p ref={boxRef} className={`${styles.box} ${className}`} title={overflow ? text : undefined}>
      <motion.span className={styles.leftFade} style={{ scaleX: leftFade }} aria-hidden />
      <motion.span className={styles.strip} style={{ x }}>
        <span ref={textRef}>{text}</span>
        {overflow > 0 && !reduceMotion && (
          <span ref={copyRef} aria-hidden style={{ marginLeft: space.titleLoopGap }}>
            {text}
          </span>
        )}
      </motion.span>
    </p>
  )
}
