import { generateKeyPairSync, createHash, createPrivateKey, createPublicKey } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { auditLogs, signingKeys } from '../../db/schema'

export interface SigningKeyPair {
  kid: string
  publicKey: string // PEM, SPKI
  privateKey: string // PEM, PKCS8
}

function keyPath(): string {
  return process.env.SIGNING_KEY_PATH ?? './data/keys/ed25519.pem'
}

function deriveKid(publicKeyPem: string): string {
  // Hash the raw 32-byte Ed25519 public key, not the PEM wrapper, so the kid
  // is stable across re-encodings of the same key.
  const raw = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })
  // The last 32 bytes of a DER SPKI-wrapped Ed25519 key are the raw key.
  const rawKey = raw.subarray(raw.length - 32)
  return createHash('sha256').update(rawKey).digest('base64url').slice(0, 16)
}

// Generates the keypair on first boot, or loads the existing one. Uses an
// exclusive-create write (flag "wx") so two concurrent first requests can
// never generate two different keys: the loser's write throws EEXIST and it
// re-reads the file the winner just created, instead of a check-then-write
// race that could silently produce two keypairs.
function loadOrCreatePem(): { pem: string; generated: boolean } {
  const path = keyPath()
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path)) {
    return { pem: readFileSync(path, 'utf8'), generated: false }
  }
  const { privateKey } = generateKeyPairSync('ed25519')
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  try {
    writeFileSync(path, pem, { flag: 'wx', mode: 0o600 })
    return { pem, generated: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      // Another process/request won the race; use what it wrote.
      return { pem: readFileSync(path, 'utf8'), generated: false }
    }
    throw error
  }
}

let cached: SigningKeyPair | null = null

// Resolves the signing keypair, generating it on first use. Always upserts
// the public key into signing_keys, not only when freshly generated: the
// Postgres volume can be reset independently of the keys volume, so the row
// can be missing even when the PEM file already exists.
export async function getSigningKeyPair(): Promise<SigningKeyPair> {
  if (cached) {
    await ensureRegistered(cached, false)
    return cached
  }
  const { pem, generated } = loadOrCreatePem()
  const privateKeyObj = createPrivateKey(pem)
  const publicKey = createPublicKey(privateKeyObj).export({ type: 'spki', format: 'pem' }) as string
  const kid = deriveKid(publicKey)
  cached = { kid, publicKey, privateKey: pem }
  await ensureRegistered(cached, generated)
  return cached
}

async function ensureRegistered(pair: SigningKeyPair, generated: boolean): Promise<void> {
  await db
    .insert(signingKeys)
    .values({ kid: pair.kid, publicKeyPem: pair.publicKey })
    .onConflictDoNothing({ target: signingKeys.kid })
  if (generated) {
    await db.insert(auditLogs).values({
      action: 'signing_key.generated',
      entityType: 'signing_key',
      payloadJson: { kid: pair.kid },
    })
  }
}

export async function listPublicKeys() {
  return db.select().from(signingKeys).orderBy(sql`${signingKeys.createdAt} asc`)
}

// The only place signing-service.ts touches the database — keeping all
// signing_keys persistence in this one module means signing-service.ts is
// otherwise pure crypto/canonicalization, and this module's two DB-touching
// exports (this one and getSigningKeyPair) are the only things a test needs
// to mock to exercise signing-service.ts without a live database.
export async function findSigningKeyRow(kid: string): Promise<{ kid: string; publicKeyPem: string } | null> {
  const [row] = await db.select().from(signingKeys).where(eq(signingKeys.kid, kid)).limit(1)
  return row ?? null
}
