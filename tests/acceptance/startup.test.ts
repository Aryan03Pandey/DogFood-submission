import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8')
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
const dockerignore = readFileSync(join(root, '.dockerignore'), 'utf8')

describe('single-command startup (docker compose up)', () => {
  it('installs dependencies and builds inside the image, so no local npm install is needed', () => {
    expect(dockerfile).toMatch(/npm ci --include=dev/)
    expect(dockerfile).toMatch(/npm run build/)
    expect(dockerfile).toMatch(/db:migrate/)
  })

  it('builds hermetically: host node_modules can never leak into or be required by the image', () => {
    expect(dockerignore).toMatch(/^node_modules$/m)
    expect(compose).toMatch(/app:\n\s+build: \./)
    expect(compose).toMatch(/seed:\n\s+build: \./)
    expect(compose).toMatch(/cli:\n\s+build: \./)
  })

  it('does NOT execute the test suite on boot', () => {
    expect(compose).not.toMatch(/vitest/)
    expect(compose).not.toMatch(/npm", "run", "acceptance"/)
    expect(compose).not.toMatch(/npm run (test|acceptance)/)
  })

  it('only references npm scripts that exist, so boot cannot exit 1 on a missing script', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const referenced = new Set(
      [...compose.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]),
    )
    expect(referenced.size).toBeGreaterThan(0)
    for (const name of referenced) {
      expect(
        Object.hasOwn(pkg.scripts, name),
        `docker-compose.yml runs "npm run ${name}" but package.json has no such script`,
      ).toBe(true)
    }
  })

  it('seeds automatically once postgres and seaweedfs are healthy', () => {
    expect(compose).toMatch(/seed:\n\s+build: \./)
    expect(compose).toMatch(/npm run db:seed/)
  })

  it('loads fixtures after seeding so boot order is migrate, seed, fixtures', () => {
    const seedBlock = compose.slice(compose.indexOf('\n  seed:'))
    const seedAt = seedBlock.indexOf('db:seed')
    const fixturesAt = seedBlock.indexOf('db:fixtures')
    expect(fixturesAt).toBeGreaterThan(seedAt)
    expect(seedBlock).toMatch(/db:fixtures/)
  })

  it('runs boot migrations without the version-gated drizzle-kit CLI', () => {
    // drizzle-kit 0.28 exits 1 on drizzle-orm 0.35 (compatibilityVersion 9
    // vs required 10), which killed the seed service. Boot must use
    // drizzle-orm's own migrator instead.
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['db:migrate']).not.toMatch(/drizzle-kit/)
    const migrateScript = readFileSync(join(root, 'scripts', 'migrate.ts'), 'utf8')
    expect(migrateScript).toMatch(/postgres-js\/migrator/)
  })

  it('migrates before seeding so a fresh volume boots without deadlocks', () => {
    const seedBlock = compose.slice(compose.indexOf('\n  seed:'))
    const migrateAt = seedBlock.indexOf('db:migrate')
    const seedAt = seedBlock.indexOf('db:seed')
    expect(migrateAt).toBeGreaterThanOrEqual(0)
    expect(seedAt).toBeGreaterThan(migrateAt)
  })

  it('serves the app only after seeding succeeds', () => {
    expect(compose).toMatch(/seed:\n\s+condition: service_completed_successfully/)
  })

  it('keeps the CLI toolchain runnable with zero local setup', () => {
    expect(compose).toMatch(/cli:\n\s+build: \./)
    expect(compose).toMatch(/command: \["npm", "run", "cli"\]/)
  })
})
