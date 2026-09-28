import 'dotenv/config'
import { sql } from '../src/db'
import { processBatch } from '../src/server/webhook-delivery-service'

// Tier 4.5 delivery worker entry point (docs/TIER4.md 4.5). Thin on purpose
// — the actual claim/send/backoff logic lives in
// src/server/webhook-delivery-service.ts so it's importable by tests
// without this file's poll loop or DB connection running.

const POLL_INTERVAL_MS = 2000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let shuttingDown = false
process.on('SIGTERM', () => {
  shuttingDown = true
})
process.on('SIGINT', () => {
  shuttingDown = true
})

async function main() {
  console.log('webhook-worker: started')
  while (!shuttingDown) {
    let processed = 0
    try {
      processed = await processBatch()
    } catch (error) {
      console.error('webhook-worker: poll failed:', error instanceof Error ? error.message : error)
    }
    if (processed === 0 && !shuttingDown) await sleep(POLL_INTERVAL_MS)
  }
  console.log('webhook-worker: shutting down')
  await sql.end()
}

main().catch((error) => {
  console.error('webhook-worker failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
