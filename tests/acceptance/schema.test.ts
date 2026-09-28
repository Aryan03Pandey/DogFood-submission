import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { allTables } from '../../src/db/schema'

const root = join(__dirname, '..', '..')

// DB-free drift guard: every column drizzle would emit in an INSERT must
// exist in the migration SQL, otherwise boot seeding dies in docker with
// `column "..." of relation "..." does not exist` (exit 1) while unit tests
// stay green because they never touch a live database.
function migrationColumns(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>()
  const add = (table: string, column: string) => {
    if (!tables.has(table)) tables.set(table, new Set())
    tables.get(table)!.add(column)
  }
  const files = readdirSync(join(root, 'drizzle'))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort()
  for (const file of files) {
    const sql = readFileSync(join(root, 'drizzle', file), 'utf8')
    for (const block of sql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\);/g)) {
      for (const line of block[2].split('\n')) {
        if (/^\s*(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(line)) continue
        const column = line.match(/^\s*"([^"]+)"/)
        if (column) add(block[1], column[1])
      }
    }
    for (const alter of sql.matchAll(/ALTER TABLE "([^"]+)" ADD COLUMN "([^"]+)"/g)) {
      add(alter[1], alter[2])
    }
  }
  return tables
}

describe('schema matches migrations', () => {
  it('every drizzle column exists in drizzle/*.sql', () => {
    const migrated = migrationColumns()
    expect(migrated.size).toBeGreaterThan(0)
    for (const table of Object.values(allTables)) {
      const config = getTableConfig(table)
      const known = migrated.get(config.name) ?? new Set<string>()
      for (const column of config.columns) {
        expect(
          known.has(column.name),
          `column "${config.name}"."${column.name}" is missing from drizzle/*.sql`,
        ).toBe(true)
      }
    }
  })
})
