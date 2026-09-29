import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from '../../app/api/files/[...path]/route'
import { publicUploadUrl, resolveFileUrl } from '../../src/lib/upload'

describe('same-origin file proxy (ngrok/CORS fix)', () => {
  it('emits app-relative URLs by default', () => {
    const saved = process.env.SEAWEEDFS_PUBLIC_URL
    delete process.env.SEAWEEDFS_PUBLIC_URL
    expect(publicUploadUrl('dogfood-assets/events/e/banner-1.png')).toBe(
      '/api/files/dogfood-assets/events/e/banner-1.png',
    )
    process.env.SEAWEEDFS_PUBLIC_URL = saved
  })

  it('still honors an explicit public filer/CDN base', () => {
    const saved = process.env.SEAWEEDFS_PUBLIC_URL
    process.env.SEAWEEDFS_PUBLIC_URL = 'https://cdn.example.com/'
    expect(publicUploadUrl('b/k.png')).toBe('https://cdn.example.com/b/k.png')
    process.env.SEAWEEDFS_PUBLIC_URL = saved
  })

  it('rewrites legacy localhost filer URLs, passes CDNs through', () => {
    expect(resolveFileUrl('http://localhost:8888/dogfood-assets/e/logo-1.png')).toBe(
      '/api/files/dogfood-assets/e/logo-1.png',
    )
    expect(resolveFileUrl('http://seaweedfs:8333/b/k.png')).toBe('/api/files/b/k.png')
    expect(resolveFileUrl('/api/files/b/k.png')).toBe('/api/files/b/k.png')
    expect(resolveFileUrl('https://cdn.example.com:8080/b/k.png')).toBe('https://cdn.example.com:8080/b/k.png')
    expect(resolveFileUrl(null)).toBeNull()
    expect(resolveFileUrl('')).toBeNull()
  })

  it('refuses path traversal without touching the filer', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      for (const path of [['..'], ['a', '..', 'b'], [''], ['a b']]) {
        const res = await GET(new Request('http://x/api/files'), {
          params: Promise.resolve({ path }),
        })
        expect(res.status).toBe(404)
      }
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('streams filer bytes with the upstream content type', async () => {
    const body = new TextEncoder().encode('fake-png')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { headers: { 'content-type': 'image/png' } })),
    )
    try {
      const res = await GET(new Request('http://x/api/files'), {
        params: Promise.resolve({ path: ['dogfood-assets', 'e', 'logo-1.png'] }),
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      expect((await res.arrayBuffer()).byteLength).toBe(body.length)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })
})
