'use client'

import { useEffect } from 'react'

// Runs inside the embed iframe. The iframe is the sender here — embed.js on
// the host page is the receiver and validates event.origin/event.source
// before trusting this — so posting to '*' is fine: only a height number
// ever leaves the frame, nothing sensitive.
export function ResizeReporter() {
  useEffect(() => {
    const report = () => {
      window.parent?.postMessage({ type: 'dogfood:resize', height: document.body.scrollHeight }, '*')
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [])

  return null
}
