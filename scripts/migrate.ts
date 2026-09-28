import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

// Boot-time migrations without drizzle-kit: drizzle-kit 0.28 gates every
// command (including `migrate`) on drizzle-orm compatibilityVersion 10, while
// this repo pins drizzle-orm 0.35 (version 9) — so `drizzle-kit migrate`
// always exits 1 here. drizzle-orm's own migrator reads the same
// drizzle/meta/_journal.json + *.sql format with no version gate.
async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('db:migrate requires DATABASE_URL to be set.')
    process.exitCode = 1
    return
  }
  const sql = postgres(connectionString, { max: 1 })
  try {
    await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
    console.log('db:migrate: migrations applied.')
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error('db:migrate failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
