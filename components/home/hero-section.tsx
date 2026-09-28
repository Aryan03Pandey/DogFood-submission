import Link from 'next/link'
import { Code2, GitBranch, Trophy, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

// homepage.md copy, rendered per docs/STYLE-GUIDELINES.md: flat theme-token
// surfaces, single green accent on the key CTA, app-default type, no
// gradients/glow. The ecosystem visual is a static flat card grid; the only
// motion is a slow float guarded by prefers-reduced-motion (no new deps).
const ecosystem = [
  { icon: Code2, title: 'Ship', detail: '12k repos linked' },
  { icon: Users, title: 'Team up', detail: 'Auto-matching on' },
  { icon: Trophy, title: 'Win', detail: '$2.4M awarded' },
  { icon: GitBranch, title: 'Fork', detail: '100k deploys' },
]

export default function HeroSection() {
  return (
    <section className="bg-background">
      <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 py-12 md:grid-cols-2 md:py-16">
        <div>
          <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.03em] text-foreground">
            Where Builders <span className="text-[#16a34a] dark:text-[#22c55e]">Innovate</span> &amp;
            Communities Scale.
          </h1>
          <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
            The ultimate platform for hackers to build the future and organizers to host seamless
            hackathons.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link
              href="#hackathons"
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'h-10 bg-[#16a34a] px-5 text-white hover:bg-[#15803d]')}
            >
              Find a Hackathon
            </Link>
            <Link
              href="#organizers"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 px-5')}
            >
              Explore Platform
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4" aria-hidden="true">
          {ecosystem.map((item, index) => (
            <div
              key={item.title}
              className={
                'rounded-xl border border-border bg-card p-6 transition-colors hover:border-[#16a34a] motion-safe:animate-[hero-float_7s_ease-in-out_infinite] motion-reduce:animate-none ' +
                (index % 2 === 1 ? 'md:mt-6 motion-safe:[animation-delay:1.2s]' : '')
              }
            >
              <item.icon size={20} strokeWidth={1.8} className="text-muted-foreground" />
              <p className="mt-4 text-[15px] font-bold text-foreground">{item.title}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
