import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canonicalize } from '../../src/lib/canonical-json'

// scripts/verify.ts is documented as needing "only the envelope file and a
// public key file — no DB access, no network". Proving that claim means
// actually running it as a real subprocess with no DATABASE_URL (and no
// other Postgres-shaped env var) in its environment, not just checking it
// has no `import { db }` line.
describe('T4 scripts/verify.ts runs with no database connection', () => {
  let dir: string
  let keyPath: string
  let goodEnvelopePath: string
  let tamperedEnvelopePath: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dogfood-verify-cli-'))
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    keyPath = join(dir, 'pub.pem')
    writeFileSync(keyPath, publicKey.export({ type: 'spki', format: 'pem' }))

    const unsigned = {
      format: 'dogfood-signed',
      version: 1,
      type: 'export',
      alg: 'Ed25519',
      kid: 'test-kid',
      signed_at: '2026-01-01T00:00:00.000Z',
      payload: { hello: 'world' },
    }
    const signature = cryptoSign(null, Buffer.from(canonicalize(unsigned), 'utf8'), privateKey).toString('base64url')

    goodEnvelopePath = join(dir, 'good.json')
    writeFileSync(goodEnvelopePath, JSON.stringify({ ...unsigned, signature }))

    tamperedEnvelopePath = join(dir, 'tampered.json')
    writeFileSync(tamperedEnvelopePath, JSON.stringify({ ...unsigned, payload: { hello: 'tampered' }, signature }))
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const root = join(__dirname, '..', '..')
  const tsxBin = join(root, 'node_modules', '.bin', 'tsx')

  function runVerify(args: string[]): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync(tsxBin, [join(root, 'scripts', 'verify.ts'), ...args], {
        cwd: root,
        // Explicitly strip DATABASE_URL: the whole point is that this
        // script must not need it.
        env: { ...process.env, DATABASE_URL: '' },
        encoding: 'utf8',
      })
      return { status: 0, stdout, stderr: '' }
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string }
      return { status: e.status, stdout: e.stdout, stderr: e.stderr }
    }
  }

  it('verifies a valid envelope and exits 0, with DATABASE_URL unset', () => {
    const result = runVerify([`--file=${goodEnvelopePath}`, `--key=${keyPath}`])
    expect(result.stdout.trim()).toBe('VALID')
    expect(result.status).toBe(0)
  }, 30000)

  it('rejects a tampered envelope and exits 1, with DATABASE_URL unset', () => {
    const result = runVerify([`--file=${tamperedEnvelopePath}`, `--key=${keyPath}`])
    expect(result.stdout.trim()).toBe('INVALID')
    expect(result.status).toBe(1)
  }, 30000)
})
