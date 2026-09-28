#!/usr/bin/env node
// Standalone Ed25519 envelope verifier. Deliberately has no DB import and
// makes no network calls: it needs only the envelope file and the signer's
// public key (PEM), so anyone can verify a signed export/manifest/record
// offline without running this app at all.
//
//   pnpm verify -- --file=envelope.json --key=pub.pem
//
// Equivalent with no Dogfood code, using only openssl (also works fully
// offline): extract the payload-minus-signature object as printed by
// `--show-signable`, canonicalize it yourself, then:
//   echo -n '<canonical bytes>' | openssl pkeyutl -verify -rawin \
//     -pubin -inkey pub.pem -sigfile <(base64 -d <<< '<signature, base64url->base64>')

import { readFileSync } from 'node:fs'
import { verify as cryptoVerify, createPublicKey } from 'node:crypto'
import { canonicalize } from '../src/lib/canonical-json'

function parseArgs(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/)
    if (match) flags[match[1]] = match[2]
  }
  return flags
}

function main(): void {
  const flags = parseArgs(process.argv.slice(2))
  if (!flags.file || !flags.key) {
    console.error('Usage: pnpm verify -- --file=envelope.json --key=pub.pem [--show-signable]')
    process.exitCode = 1
    return
  }

  const envelope = JSON.parse(readFileSync(flags.file, 'utf8'))
  const publicKeyPem = readFileSync(flags.key, 'utf8')

  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
    console.error('INVALID: envelope file is not a JSON object')
    process.exitCode = 1
    return
  }
  const { signature, ...unsigned } = envelope as Record<string, unknown>
  if (typeof signature !== 'string') {
    console.error('INVALID: envelope has no string "signature" field')
    process.exitCode = 1
    return
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(canonicalize(unsigned), 'utf8')
  } catch (error) {
    console.error(`INVALID: could not canonicalize envelope: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
    return
  }

  if (flags['show-signable']) {
    console.log(bytes.toString('utf8'))
    return
  }

  const ok = cryptoVerify(null, bytes, createPublicKey(publicKeyPem), Buffer.from(signature, 'base64url'))
  console.log(ok ? 'VALID' : 'INVALID')
  process.exitCode = ok ? 0 : 1
}

main()
