'use client'

import dynamic from 'next/dynamic'
import 'swagger-ui-react/swagger-ui.css'

// swagger-ui-react touches window at import time, and `ssr: false` requires
// a Client Component boundary in the App Router — hence this whole page is
// 'use client'. Bundled by Next from the npm package, never a CDN, so it
// still renders with the network off.
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false })

export default function ApiDocsPage() {
  return <SwaggerUI url="/api/openapi.json" />
}
