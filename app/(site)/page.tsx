import HeroSection from '@/components/home/hero-section'
import StatsBanner from '@/components/home/stats-banner'
import ActiveHackathons from '@/components/home/active-hackathons'
import OrganizerFeatures from '@/components/home/organizer-features'
import MeshBackdrop from '@/components/home/mesh-backdrop'

// Marketing homepage. Structure and copy follow homepage.md; all styling
// follows docs/STYLE-GUIDELINES.md (theme tokens, flat surfaces, green accent
// only), which wins wherever the two conflict — except the hero, which is a
// deliberate neon showcase band (Three.js, user-approved) that adapts to
// the theme: midnight navy in dark mode, hazy ice-blue in light mode.
// A single fixed procedural mesh (MeshBackdrop, a client component mounted
// once behind everything) covers the whole page, so every section below
// stays transparent and shares the hero's backdrop. Navbar and footer come
// from the site layout.
export default function HomePage() {
  return (
    <main>
      <MeshBackdrop />
      <HeroSection />
      <StatsBanner />
      <ActiveHackathons />
      <OrganizerFeatures />
    </main>
  )
}
