/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // pdfkit (Tier 4.7 certificates) reads its own bundled AFM font-metric
  // files at runtime via a path relative to its own node_modules location
  // (fs.readFileSync(path.join(__dirname, 'data', 'Helvetica.afm'))).
  // Webpack's server bundling relocates that code into .next/server/chunks
  // without copying the data files alongside it, breaking that lookup
  // (ENOENT) in a production build/start — dev mode doesn't bundle, so this
  // only surfaces after `next build`. Excluding it from bundling keeps
  // pdfkit's own require() resolution intact, reading straight from
  // node_modules at runtime instead.
  serverExternalPackages: ['pdfkit'],
  // Order matters: Next.js applies these in array order and, for the same
  // path + header key, the LAST matching entry wins. The global rule matches
  // every path (embed included); the embed-specific rule is listed after it
  // so it overrides the global value only for /embed/*, allowing the widget
  // to be framed cross-site while every other route stays clickjacking-safe.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self'" }],
      },
      {
        source: '/embed/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
    ]
  },
}

export default nextConfig
