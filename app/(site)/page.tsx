import HeroSection from '@/components/home/hero-section'
import StatsBanner from '@/components/home/stats-banner'
import ActiveHackathons from '@/components/home/active-hackathons'
import OrganizerFeatures from '@/components/home/organizer-features'

// Marketing homepage. Structure and copy follow homepage.md; all styling
// follows docs/STYLE-GUIDELINES.md (theme tokens, flat surfaces, green accent
// only), which wins wherever the two conflict (no gradients, glow,
// glassmorphism, or hardcoded dark slate). Navbar and footer come from the
// site layout.
export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <StatsBanner />
      <ActiveHackathons />
      <OrganizerFeatures />
    </main>
  )
}
