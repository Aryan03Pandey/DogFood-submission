// homepage.md copy in a STYLE-GUIDELINES.md card: flat surface, hairline
// border, single radius (rounded-xl), theme tokens for both color modes.
const stats = [
  { value: '1M+', label: 'Hackers Worldwide' },
  { value: '100K+', label: 'Projects Deployed' },
  { value: '2,000+', label: 'Hackathons Hosted' },
]

export default function StatsBanner() {
  return (
    <section id="community" aria-label="Community stats" className="bg-background">
      <div className="mx-auto max-w-5xl scroll-mt-20 px-5">
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-3 sm:p-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center sm:text-left">
              <p className="text-[26px] font-bold tracking-[-0.03em] text-foreground">{stat.value}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
