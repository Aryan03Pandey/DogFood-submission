'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

// Homepage hero: transparent band over the fixed page-wide mesh backdrop,
// with its own CSS glow/grid overlays for depth. Left: eyebrow, headline,
// subcopy, dual CTAs. Right: procedural Three.js infinity cube (no external
// assets). Bottom: upcoming-events ticker.
const HeroScene = dynamic(() => import('./hero-scene'), {
  ssr: false,
  loading: () => <div className="absolute inset-0" aria-hidden="true" />,
})

const tickerItems = [
  'Artificial Intelligence',
  'Web3',
  'Open Source',
  'FinTech',
  'GreenTech',
  'Cybersecurity',
  'AR/VR',
  'DevOps',
]

export default function HeroSection() {
  const reduceMotion = useReducedMotion() ?? false
  const rise = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay: reduceMotion ? 0 : delay, ease: 'easeOut' as const },
  })

  return (
    <section className="relative overflow-hidden text-slate-900 dark:text-white">
      {/* Backdrop: theme-aware wash, faint grid, horizon glow. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_70%_40%,rgba(47,123,255,0.16),transparent_70%)] dark:bg-[radial-gradient(ellipse_60%_50%_at_70%_40%,rgba(56,89,199,0.35),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_35%_at_20%_80%,rgba(162,28,175,0.12),transparent_70%)] dark:bg-[radial-gradient(ellipse_40%_35%_at_20%_80%,rgba(168,85,247,0.22),transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.16] bg-[linear-gradient(rgba(15,42,67,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(15,42,67,0.35)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_40%,black,transparent)] dark:opacity-[0.13] dark:bg-[linear-gradient(rgba(148,163,184,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.5)_1px,transparent_1px)]" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 pb-10 pt-14 md:grid-cols-2 md:pt-20">
        <div>
          <motion.p
            {...rise(0)}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-700/25 bg-cyan-500/10 px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-cyan-700 dark:border-white/15 dark:bg-white/5 dark:text-cyan-200"
          >
            <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
            The hackathon platform
          </motion.p>
          <motion.h1
            {...rise(0.08)}
            className="mt-5 text-[40px] font-bold leading-[1.06] tracking-[-0.02em] md:text-[58px]"
          >
            Empowering innovators, shaping the future.
          </motion.h1>
          <motion.p {...rise(0.16)} className="mt-5 max-w-lg text-[16px] leading-7 text-slate-600 dark:text-slate-300">
            Host, discover, and collaborate at multiple leading global hackathons on the
            ultimate platform for builders and creators.
          </motion.p>
          <motion.div {...rise(0.24)} className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="#hackathons"
              className={cn(
                'inline-flex h-12 items-center rounded-full bg-[#2f7bff] px-7 text-[14px] font-bold text-white',
                'shadow-[0_0_24px_rgba(47,123,255,0.55)] transition-all hover:bg-[#4d8dff] hover:shadow-[0_0_32px_rgba(47,123,255,0.75)]',
              )}
            >
              Explore hackathons
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
          className="relative h-72 md:h-[420px]"
        >
          <HeroScene />
        </motion.div>
      </div>

      <div className="relative border-t border-slate-900/10 bg-white/50 dark:border-white/10 dark:bg-black/30">
        <div className="mx-auto flex max-w-6xl items-center gap-3 overflow-hidden px-5 py-2.5">
          <div
            className={cn(
              'flex min-w-0 flex-1 whitespace-nowrap text-[13px] font-semibold text-slate-700 dark:text-slate-200',
              !reduceMotion && 'motion-safe:animate-[hero-marquee_28s_linear_infinite]',
            )}
            aria-label="Popular tech tracks"
          >
            {[0, 1].map((copy) => (
              <span key={copy} className="flex shrink-0 gap-8 pr-8" aria-hidden={copy === 1}>
                {tickerItems.map((item) => (
                  <span key={`${copy}-${item}`} className="flex items-center gap-8">
                    <span>{item}</span>
                    <span className="text-cyan-400" aria-hidden="true">
                      |
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
