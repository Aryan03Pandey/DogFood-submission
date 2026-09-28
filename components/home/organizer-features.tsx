import { CheckCircle2 } from 'lucide-react'

// homepage.md organizer section, STYLE-GUIDELINES.md compliant: alternating
// two-column layout, green check icons only, dashboard mockup built from flat
// theme-token surfaces with a grayscale chart ramp plus one green highlight.
const features = [
  { title: '1-Click Registration', detail: 'Hackers join with a single link — no forms, no friction.' },
  { title: 'Auto-Team Matching', detail: 'Skills-based matching builds balanced teams for you.' },
  { title: 'Built-in Judging Portals', detail: 'Scores, rubrics, and winners in one shared workspace.' },
]

const bars = [34, 52, 44, 68, 58, 82, 100]

export default function OrganizerFeatures() {
  return (
    <section id="organizers" aria-label="For organizers" className="bg-background">
      <div className="mx-auto grid max-w-5xl scroll-mt-20 items-center gap-8 px-5 py-12 md:grid-cols-2 md:py-16">
        <div>
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-foreground">
            Focus on the hackers, we handle the rest.
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
                  <p className="text-[14px] font-bold text-foreground">{feature.title}</p>
                  <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{feature.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden="true">
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex flex-col gap-3 p-6">
            <div className="flex h-28 items-end gap-2 border-b border-border pb-0">
              {bars.map((height, index) => (
                <div
                  key={index}
                  style={{ height: `${height}%` }}
                  className={
                    index === bars.length - 1
                      ? 'w-full rounded-t-lg bg-[#16a34a]'
                      : 'w-full rounded-t-lg bg-foreground/10'
                  }
                />
              ))}
            </div>
            <div className="h-9 rounded-lg bg-muted" />
            <div className="h-9 rounded-lg bg-muted" />
            <div className="h-9 w-2/3 rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    </section>
  )
}
