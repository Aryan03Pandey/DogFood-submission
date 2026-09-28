#!/usr/bin/env node
// dogfood-cli: offline user administration. Runs inside the backend container
// (or any shell with DATABASE_URL + installed dependencies):
//   docker compose run --rm cli npm run cli -- create-user --role=admin --email=admin@local
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { AuthError, createUser, listUsers, normalizeRole } from '../src/server/auth-service'
import { eventExists, exportEvent, exportInstance } from '../src/server/export-service'
import { ImportError, importData } from '../src/server/import-service'
import type { UserRole } from '../src/db/schema'

function parseArgs(argv: string[]): { command: string; flags: Record<string, string>; rest: string[] } {
  const [command = '', ...rest] = argv
  const flags: Record<string, string> = {}
  const positional: string[] = []
  for (const arg of rest) {
    const match = arg.match(/^--([^=]+)=(.*)$/)
    if (match) flags[match[1]] = match[2]
    else positional.push(arg)
  }
  return { command, flags, rest: positional }
}

function usage(): string {
  return [
    'dogfood-cli (offline administration)',
    '',
    'Commands:',
    '  create-user --email=ADDR --role=ROLE [--password=PW] [--organization=ORG]',
    '      Create a user. ROLE accepts superadmin|admin|organizer|judge|participant.',
    '      Without --password a random one is generated and printed (no email exists offline).',
    '  list-users',
    '      List all users with their global roles.',
    '  export --event=EVENT_ID --out=FILE [--include-credentials]',
    '      Export one event (and everything referencing it) as a signed-format JSON envelope.',
    '  backup --out=FILE [--include-credentials]',
    '      Export the entire instance.',
    '  import --file=FILE [--dry-run] [--force]',
    '      Restore an export/backup file inside one transaction. --dry-run rolls back',
    '      after validating and reports row counts. Restoring scope=instance refuses a',
    '      non-empty instance unless --force.',
    '',
    'Examples:',
    '  docker compose run --rm cli npm run cli -- create-user --role=admin --email=admin@local',
  ].join('\n')
}

function writeExport(out: string | undefined, envelope: unknown): void {
  if (!out) {
    console.error('export/backup requires --out=FILE.')
    process.exitCode = 1
    return
  }
  writeFileSync(out, `${JSON.stringify(envelope, null, 2)}\n`)
  console.log(`Wrote ${out}.`)
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2))

  if (!command || command === 'help' || command === '--help' || flags.help !== undefined) {
    console.log(usage())
    return
  }

  try {
    if (command === 'create-user') {
      const email = flags.email ?? ''
      const role = normalizeRole(flags.role ?? 'participant')
      if (!email.includes('@')) {
        console.error('create-user requires --email=ADDR.')
        process.exitCode = 1
        return
      }
      if (!role) {
        console.error(`Unknown role "${flags.role}". Use superadmin|admin|organizer|judge|participant.`)
        process.exitCode = 1
        return
      }
      let password = flags.password
      let generated = false
      if (!password) {
        password = randomBytes(18).toString('base64url')
        generated = true
      }
      if (password.length < 8) {
        console.error('Password must be at least 8 characters.')
        process.exitCode = 1
        return
      }
      const user = await createUser({
        email,
        password,
        role: role as UserRole,
        organization: flags.organization,
      })
      console.log(`Created user ${user.email} (id=${user.id}, role=${user.role}).`)
      if (generated) console.log(`Generated password (shown once, no email offline): ${password}`)
      return
    }

    if (command === 'list-users') {
      const users = await listUsers()
      if (users.length === 0) {
        console.log('No users yet.')
        return
      }
      for (const user of users) {
        console.log(`${user.id}  ${user.email}  ${user.role}  ${user.createdAt.toISOString()}`)
      }
      return
    }

    if (command === 'export') {
      if (!flags.event) {
        console.error('export requires --event=EVENT_ID.')
        process.exitCode = 1
        return
      }
      if (!(await eventExists(flags.event))) {
        console.error(`No event with id "${flags.event}".`)
        process.exitCode = 1
        return
      }
      const envelope = await exportEvent(flags.event, { includeCredentials: flags['include-credentials'] !== undefined })
      writeExport(flags.out, envelope)
      return
    }

    if (command === 'backup') {
      const envelope = await exportInstance({ includeCredentials: flags['include-credentials'] !== undefined })
      writeExport(flags.out, envelope)
      return
    }

    if (command === 'import') {
      if (!flags.file) {
        console.error('import requires --file=FILE.')
        process.exitCode = 1
        return
      }
      const payload = JSON.parse(readFileSync(flags.file, 'utf8'))
      const summary = await importData(payload, {
        dryRun: flags['dry-run'] !== undefined,
        force: flags.force !== undefined,
      })
      console.log(summary.dryRun ? 'Dry run (rolled back). Row counts:' : 'Imported. Row counts:')
      for (const [table, count] of Object.entries(summary.counts)) console.log(`  ${table}: ${count}`)
      if (summary.placeholderPasswordUserIds.length > 0) {
        console.log(
          `\n${summary.placeholderPasswordUserIds.length} user(s) had no password_hash in the file and were ` +
            'given a shared, unusable placeholder — they need a real password set via the API or ' +
            '`dogfood-cli` before they can log in:',
        )
        for (const id of summary.placeholderPasswordUserIds) console.log(`  ${id}`)
      }
      return
    }

    console.error(`Unknown command "${command}".\n\n${usage()}`)
    process.exitCode = 1
  } catch (error) {
    if (error instanceof AuthError && error.code === 'EMAIL_TAKEN') {
      console.error('That email is already registered.')
      process.exitCode = 1
      return
    }
    if (error instanceof ImportError && error.code === 'INSTANCE_NOT_EMPTY') {
      console.error(
        'Refusing to restore scope=instance: this instance already has data beyond the seed/fixtures. ' +
          'Pass --force to overwrite it anyway.',
      )
      process.exitCode = 1
      return
    }
    if (isConnectionError(error)) {
      console.error('Cannot reach PostgreSQL. Is DATABASE_URL set and the database up?')
      process.exitCode = 1
      return
    }
    throw error
  }
}

function isConnectionError(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? ''
  const message = error instanceof Error ? error.message : String(error)
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || /connect|connection|ECONNREFUSED/i.test(message)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
