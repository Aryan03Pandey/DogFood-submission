// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// public/embed.js is a plain-JS loader meant to run on an arbitrary host
// page, not through this app's own bundler — so it's exercised here as a
// real script, executed via document.currentScript exactly like a browser
// would, rather than imported as a module.
const embedJsSource = readFileSync(join(__dirname, '..', '..', 'public', 'embed.js'), 'utf8')

function loadEmbedScript(attrs: Record<string, string>) {
  const scriptEl = document.createElement('script')
  scriptEl.src = 'http://portal.test/embed.js'
  for (const [key, value] of Object.entries(attrs)) scriptEl.setAttribute(key, value)
  const container = document.createElement('div')
  container.appendChild(scriptEl)
  document.body.appendChild(container)

  // jsdom only sets document.currentScript for the duration of a script it
  // is itself executing; since we run embed.js's source via `new Function`
  // instead (see module comment), currentScript is stood in manually so the
  // loader can find its own <script> tag exactly like it would in a browser.
  Object.defineProperty(document, 'currentScript', { value: scriptEl, configurable: true })
  try {
    new Function(embedJsSource)()
  } finally {
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true })
  }
  return { scriptEl, container }
}

describe('T4 public/embed.js', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('injects an iframe pointing at /embed/:eventId with theme/track/limit carried through', () => {
    const { container } = loadEmbedScript({ 'data-event': 'evt_1', 'data-theme': 'dark', 'data-track': 'trk_1' })
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    expect(iframe).toBeTruthy()
    expect(iframe.src).toBe('http://portal.test/embed/evt_1?theme=dark&track=trk_1')
    expect(iframe.getAttribute('loading')).toBe('lazy')
  })

  it('does nothing (no iframe) when data-event is missing', () => {
    const { container } = loadEmbedScript({})
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('defaults theme to light when data-theme is omitted', () => {
    const { container } = loadEmbedScript({ 'data-event': 'evt_1' })
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    expect(iframe.src).toContain('theme=light')
  })

  describe('resize messages', () => {
    let container: HTMLElement
    let iframe: HTMLIFrameElement

    beforeEach(() => {
      ;({ container } = loadEmbedScript({ 'data-event': 'evt_1' }))
      iframe = container.querySelector('iframe') as HTMLIFrameElement
    })

    it('ignores a message from the wrong origin, even with the right source', () => {
      iframe.style.height = '120px'
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'dogfood:resize', height: 999 },
          origin: 'http://evil.test',
          source: iframe.contentWindow,
        }),
      )
      expect(iframe.style.height).toBe('120px')
    })

    it('ignores a same-origin message from a source that is not this iframe', () => {
      iframe.style.height = '120px'
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'dogfood:resize', height: 999 },
          origin: 'http://portal.test',
          source: window, // not iframe.contentWindow
        }),
      )
      expect(iframe.style.height).toBe('120px')
    })

    it('ignores a correctly-sourced message with the wrong "type"', () => {
      iframe.style.height = '120px'
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'not-a-resize-event', height: 999 },
          origin: 'http://portal.test',
          source: iframe.contentWindow,
        }),
      )
      expect(iframe.style.height).toBe('120px')
    })

    it('resizes the iframe on a correctly-origined, correctly-sourced resize message', () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'dogfood:resize', height: 555 },
          origin: 'http://portal.test',
          source: iframe.contentWindow,
        }),
      )
      expect(iframe.style.height).toBe('555px')
    })
  })
})
