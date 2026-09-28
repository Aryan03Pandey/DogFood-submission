import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8')
const envExample = readFileSync(join(root, '.env.example'), 'utf8')

describe('object storage (SeaweedFS)', () => {
  it('has no MinIO remnants in compose or env example', () => {
    for (const [name, text] of [['docker-compose.yml', compose], ['.env.example', envExample]] as const) {
      expect(text, name).not.toMatch(/minio/i)
      expect(text, name).not.toMatch(/MINIO_/)
      expect(text, name).not.toMatch(/9000|9001/)
    }
  })

  it('runs SeaweedFS with S3 and filer endpoints', () => {
    expect(compose).toMatch(/seaweedfs:/)
    expect(compose).toMatch(/chrislusf\/seaweedfs/)
    expect(compose).toMatch(/-s3/)
    expect(compose).toMatch(/-filer/)
    expect(compose).toMatch(/8333:8333/)
    expect(compose).toMatch(/8888:8888/)
    expect(compose).toMatch(/seaweeddata:\/data/)
  })

  it('wires the app to SeaweedFS S3 with no MinIO variables', () => {
    expect(compose).toMatch(/S3_ENDPOINT: http:\/\/seaweedfs:8333/)
    expect(compose).toMatch(/SEAWEEDFS_FILER_URL: http:\/\/seaweedfs:8888/)
    expect(compose).toMatch(/S3_BUCKET: dogfood-assets/)
    expect(compose).toMatch(/seaweedfs:\n\s+condition: service_healthy/)
  })

  it('documents SeaweedFS endpoints for local development', () => {
    expect(envExample).toMatch(/S3_ENDPOINT=http:\/\/localhost:8333/)
    expect(envExample).toMatch(/SEAWEEDFS_FILER_URL=http:\/\/localhost:8888/)
    expect(envExample).toMatch(/S3_BUCKET=dogfood-assets/)
  })
})
