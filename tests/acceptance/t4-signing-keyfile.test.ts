import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// This file tests src/server/crypto/keys.ts itself (the one module allowed
// to touch signing_keys/Postgres and the PEM file — see its own comment),
// so unlike tests/acceptance/t4-signing.test.ts it must NOT mock crypto/keys
// — only its one dependency, ../db, is mocked here. Each test resets the
// module registry (vi.resetModules) to simulate a fresh process boot, since
// getSigningKeyPair caches its result in a module-scope variable.
const hoisted = vi.hoisted(() => ({ insertCalls: [] as Array<{ tableName: string; vals: unknown }> }))

vi.mock('../../src/db', async () => {
  // getTableConfig is the same official drizzle-orm API tests/acceptance/
  // schema.test.ts already uses to read a table's SQL name — reused here
  // instead of guessing at an internal symbol.
  const { getTableConfig } = await import('drizzle-orm/pg-core')
  const db = {
    insert: (table: Parameters<typeof getTableConfig>[0]) => ({
      values: (vals: unknown) => {
        const tableName = getTableConfig(table).name
        const p: any = Promise.resolve(undefined)
        p.onConflictDoNothing = () => {
          hoisted.insertCalls.push({ tableName, vals })
          return Promise.resolve([])
        }
        // audit_logs is inserted bare (no onConflict chain) — record there too.
        if (tableName === 'audit_logs') hoisted.insertCalls.push({ tableName, vals })
        return p
      },
    }),
  }
  return { db }
})

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dogfood-signing-'))
  process.env.SIGNING_KEY_PATH = join(dir, 'ed25519.pem')
  hoisted.insertCalls.length = 0
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SIGNING_KEY_PATH
  rmSync(dir, { recursive: true, force: true })
})

describe('T4 signing key file lifecycle', () => {
  it('creates the key file with 0600 permissions', async () => {
    const { getSigningKeyPair } = await import('../../src/server/crypto/keys')
    await getSigningKeyPair()
    const stat = statSync(process.env.SIGNING_KEY_PATH!)
    expect(stat.mode & 0o777).toBe(0o600)
  })

  it('reuses an existing key file across a fresh boot rather than regenerating it', async () => {
    const { getSigningKeyPair } = await import('../../src/server/crypto/keys')
    const first = await getSigningKeyPair()

    vi.resetModules() // simulate a fresh process boot with the same PEM already on disk
    const { getSigningKeyPair: afterRestart } = await import('../../src/server/crypto/keys')
    const second = await afterRestart()

    expect(second.publicKey).toBe(first.publicKey)
    expect(second.privateKey).toBe(first.privateKey)
    expect(second.kid).toBe(first.kid)
  })

  it('audit-logs key generation exactly once, not on a reused-file boot', async () => {
    const { getSigningKeyPair } = await import('../../src/server/crypto/keys')
    await getSigningKeyPair()
    expect(hoisted.insertCalls.filter((c) => c.tableName === 'audit_logs')).toHaveLength(1)

    vi.resetModules()
    const { getSigningKeyPair: afterRestart } = await import('../../src/server/crypto/keys')
    await afterRestart()
    // Still exactly one audit_logs row overall: the second boot reused the
    // file, so nothing new was generated.
    expect(hoisted.insertCalls.filter((c) => c.tableName === 'audit_logs')).toHaveLength(1)
  })

  it('re-registers the public key in the DB on every load, even when the file already existed', async () => {
    const { getSigningKeyPair } = await import('../../src/server/crypto/keys')
    await getSigningKeyPair()
    const firstRegistrations = hoisted.insertCalls.filter((c) => c.tableName === 'signing_keys').length
    expect(firstRegistrations).toBe(1)

    // Simulate the DB volume being reset independently of the keys volume:
    // the file survives, but the row is gone. A fresh boot must re-insert it.
    vi.resetModules()
    const { getSigningKeyPair: afterRestart } = await import('../../src/server/crypto/keys')
    await afterRestart()
    const secondRegistrations = hoisted.insertCalls.filter((c) => c.tableName === 'signing_keys').length
    expect(secondRegistrations).toBe(2)
  })

  it('re-registers on every call even within one process (cache hit path)', async () => {
    const { getSigningKeyPair } = await import('../../src/server/crypto/keys')
    await getSigningKeyPair()
    await getSigningKeyPair()
    await getSigningKeyPair()
    expect(hoisted.insertCalls.filter((c) => c.tableName === 'signing_keys')).toHaveLength(3)
  })
})
