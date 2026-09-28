import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apiRoutes } from '../../src/server/openapi'

const root = join(__dirname, '..', '..')
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

function findRouteFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...findRouteFiles(full))
    else if (entry === 'route.ts') found.push(full)
  }
  return found
}

// app/api/events/[id]/export.json/route.ts -> /api/events/{id}/export.json
function routePathFor(fileAbsPath: string): string {
  const relative = fileAbsPath.slice(join(root, 'app').length).replace(/\/route\.ts$/, '')
  return relative.replace(/\[([^\]]+)\]/g, '{$1}')
}

describe('T4 OpenAPI route coverage', () => {
  it('registers every exported HTTP method of every app/api/**/route.ts in apiRoutes', () => {
    const registered = new Set(apiRoutes.map((r) => `${r.method.toUpperCase()} ${r.path}`))
    const files = findRouteFiles(join(root, 'app', 'api'))
    expect(files.length).toBeGreaterThan(0)

    const missing: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const path = routePathFor(file)
      for (const method of HTTP_METHODS) {
        const isExported = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(source)
        if (isExported && !registered.has(`${method} ${path}`)) {
          missing.push(`${method} ${path} (${file.slice(root.length + 1)})`)
        }
      }
    }
    expect(missing, `routes missing from apiRoutes:\n${missing.join('\n')}`).toEqual([])
  })

  it('never registers a route that no longer exists as an app/api/**/route.ts export', () => {
    const files = findRouteFiles(join(root, 'app', 'api'))
    const exported = new Set<string>()
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const path = routePathFor(file)
      for (const method of HTTP_METHODS) {
        if (new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(source)) {
          exported.add(`${method} ${path}`)
        }
      }
    }
    const stale = apiRoutes
      .map((r) => `${r.method.toUpperCase()} ${r.path}`)
      .filter((key) => !exported.has(key))
    expect(stale, `apiRoutes entries with no matching route file:\n${stale.join('\n')}`).toEqual([])
  })
})

describe('T4 GET /api/openapi.json', () => {
  it('returns 200 with a valid OpenAPI 3.x document', async () => {
    const { GET } = await import('../../app/api/openapi.json/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.openapi).toMatch(/^3\.\d+\.\d+$/)
    expect(body.info?.title).toBeTruthy()
    expect(typeof body.paths).toBe('object')
    expect(Object.keys(body.paths).length).toBeGreaterThan(0)
  })
})
