'use client'

import dynamic from 'next/dynamic'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'

// Hacker value proposition (hackers are the primary audience): why compete
// on RaptorHack, with green checks. The visual is a procedural 3D trophy —
// win prizes, top the leaderboard — with its own glow, seated on the page
// mesh.
const OrganizerArtifact = dynamic(() => import('./organizer-artifact'), {
  ssr: false,
  loading: () => <div className="absolute inset-0" aria-hidden="true" />,
})

const features = [
  { title: 'Team up with invite links', detail: 'Start a team and bring hackers aboard with a shareable invite link.' },
  { title: 'Ship and get seen', detail: 'Submit projects, collect community votes, and build a portfolio that stands out.' },
  { title: 'Win real prizes', detail: 'Compete for cash, credits, and glory with transparent judging and live leaderboards.' },
]

export default function OrganizerFeatures() {
  const reduceMotion = useReducedMotion() ?? false

  return (
    <section id="hackers" aria-label="For hackers">
      <div className="mx-auto grid max-w-5xl scroll-mt-20 items-center gap-8 px-5 py-12 md:grid-cols-2 md:py-16">
        <div>
          <h2 className="text-[28px] font-bold tracking-[-0.02em] text-foreground">
            Everything you need to win your next hackathon.
          </h2>
          <ul className="mt-6 flex flex-col gap-4">
            {features.map((feature) => (
              <li key={feature.title} className="flex items-start gap-3">
                <CheckCircle2
                  size={18}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-[#16a34a] dark:text-[#22c55e]"
                />
                <div>
                  <p className="text-[16px] font-bold text-foreground">{feature.title}</p>
                  <p className="mt-1 text-[14px] leading-6 text-muted-foreground">{feature.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="relative h-80 overflow-hidden md:h-[420px]"
        >
          {/* Seating glow: theme-aware wash behind the trophy. */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_50%_55%,rgba(217,164,65,0.16),transparent_70%)] dark:bg-[radial-gradient(ellipse_55%_50%_at_50%_55%,rgba(245,185,66,0.14),transparent_70%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_35%_at_50%_90%,rgba(47,123,255,0.12),transparent_70%)] dark:bg-[radial-gradient(ellipse_40%_35%_at_50%_90%,rgba(56,89,199,0.3),transparent_70%)]" />
          </div>
          <OrganizerArtifact />
        </motion.div>
      </div>
    </section>
  )
}
