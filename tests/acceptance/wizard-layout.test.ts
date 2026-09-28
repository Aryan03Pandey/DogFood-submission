import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const wizard = readFileSync(join(root, 'components/console/event-wizard.tsx'), 'utf8')
const editor = readFileSync(join(root, 'components/console/rich-text-editor.tsx'), 'utf8')

describe('wizard layout', () => {
  it('lays timeline pickers out in a single column', () => {
    const timeline = readFileSync(join(root, 'components/console/wizard-steps/timeline-step.tsx'), 'utf8')
    expect(timeline).not.toMatch(/sm:grid-cols-2/)
  })

  it('offers Go Back on every step but the first', () => {
    expect(wizard).toMatch(/Go Back/)
    expect(wizard).toMatch(/function onBack\(\)/)
    expect(wizard).toMatch(/if \(saving \|\| stepIndex === 0\) return/)
    expect(wizard).toMatch(/\{stepIndex > 0 && \(/)
    expect(wizard).toMatch(/setStepIndex\(prev\)/)
  })

  it('cancels without a password, keeping saved steps as a draft', () => {
    expect(wizard).toMatch(/confirmingCancel/)
    expect(wizard).toMatch(/router\.push\('\/console'\)/)
    expect(wizard).toMatch(/stay as a draft/)
    expect(wizard).not.toMatch(/apiDeleteEvent/)
  })

  it('saves the open step when switching headers so drafts never lose input', () => {
    expect(wizard).toMatch(/async function goTo\(index: number\)/)
    expect(wizard).toMatch(/if \(index === stepIndex \|\| saving\) return/)
    expect(wizard).toMatch(/const eventId = await persistCurrent\(\)/)
    expect(wizard).toMatch(/setStepIndex\(index\)/)
  })

  it('syncs tracks on save and feeds saved tracks to prize assignment', () => {
    expect(wizard).toMatch(/apiCreateTrack/)
    expect(wizard).toMatch(/apiUpdateTrack/)
    expect(wizard).toMatch(/apiDeleteTrack/)
    expect(wizard).toMatch(/tracks=\{allTracks\}/)
    expect(wizard).toMatch(/<TracksStep/)
  })

  it('renders steps as an accordion with a single expanded panel', () => {
    expect(wizard).toMatch(/aria-expanded/)
    expect(wizard).toMatch(/aria-controls/)
    expect(wizard).toMatch(/role="region"/)
    expect(wizard).not.toMatch(/aria-current/)
  })

  it('gives the live preview the larger column and a fixed scrollable height', () => {
    expect(wizard).toMatch(/minmax\(0,8fr\)/)
    expect(wizard).toMatch(/max-h-\[min\(880px,calc\(100vh-9rem\)\)\]/)
    expect(wizard).toMatch(/overflow-y-auto/)
  })

  it('uploads only on save: picks stay local, any save flushes pending files', () => {
    const field = readFileSync(join(root, 'components/console/image-upload-field.tsx'), 'utf8')
    expect(field).not.toMatch(/uploadImageFile/)
    expect(field).toMatch(/onSelectFile\(slot, file\)/)
    expect(wizard).toMatch(/saveMediaUrls/)
    expect(wizard).toMatch(/Object\.values\(pendingFiles\)/)
    expect(wizard).not.toMatch(/apiUpdateEvent\(data\.eventId/)
    expect(wizard).toMatch(/localPreviews\.logo \?\? data\.logoUrl/)
    expect(wizard).toMatch(/localPreviews\.banner \?\? data\.bannerUrl/)
    expect(wizard).toMatch(/EventPreview data=\{previewData\}/)
  })

  it('keeps the description editor in a fixed responsive scroll box', () => {
    expect(editor).toMatch(/h-\[42vh\]/)
    expect(editor).toMatch(/min-h-\[280px\]/)
    expect(editor).toMatch(/max-h-\[520px\]/)
    expect(editor).toMatch(/overflow-y-auto/)
    expect(editor).toMatch(/<EditorContent/)
    expect(editor).toMatch(/cursor-text/)
    expect(editor).toMatch(/closest\('\.tiptap'\)/)
  })
})
