import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildOpenApiSpec } from '../src/server/openapi'

// Run from the repository root: `npm run openapi`.
const spec = buildOpenApiSpec()
const outPath = join(process.cwd(), 'openapi-spec.json')
writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`)
console.log(`OpenAPI spec written to ${outPath} (${Object.keys(spec.paths).length} paths).`)
