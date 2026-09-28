import { Boxes, FolderGit2, Globe2, Users } from 'lucide-react'

// Organization metrics for the homepage: static marketing numbers about
// RaptorHack itself (never from the database). Two-column editorial layout
// per the reference — bold figure, short line, thin geometric icon — in
// theme tokens for both color modes. The section stays transparent so the
// fixed page mesh shows through.
const stats = [
  {
    value: '35+ events',
    body: 'We manage events where inventiveness meets practicality, crafted to motivate and enthrall.',
    Icon: Boxes,
  },
  {
    value: '1000+ projects',
    body: 'With over a hundred pioneering projects, our hackathons demonstrate the power of collaboration and sharp minds.',
    Icon: FolderGit2,
  },
  {
    value: '3500+ participants',
    body: 'Thousand innovators have contributed, each advancing our collective quest for progress.',
    Icon: Users,
  },
  {
    value: '30+ countries',
    body: 'We unite diverse minds from over 30 countries, fostering a cohesive movement for change.',
    Icon: Globe2,
  },
]

export default function StatsBanner() {
  return (
    <section id="community" aria-label="Community stats">
      <div className="mx-auto max-w-5xl scroll-mt-20 px-5 py-12 md:py-16">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2">
          {stats.map(({ value, body, Icon }) => (
            <div key={value} className="min-w-0">
              <dt className="text-[28px] font-bold tracking-[-0.02em] text-foreground">{value}</dt>
              <dd className="mt-2 max-w-md text-[15px] leading-7 text-muted-foreground">{body}</dd>
              <dd>
                <Icon
                  size={30}
                  strokeWidth={1.25}
                  aria-hidden="true"
                  className="mt-4 text-cyan-700 drop-shadow-[0_0_10px_rgba(34,211,238,0.35)] dark:text-cyan-300"
                />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
