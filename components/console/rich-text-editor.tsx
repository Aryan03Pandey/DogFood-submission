'use client'

import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link as LinkExtension } from '@tiptap/extension-link'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { TextAlign } from '@tiptap/extension-text-align'
import { Underline } from '@tiptap/extension-underline'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Underline as UnderlineIcon,
  Unlink,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

// Dependency-free editing is not worth it here: execCommand is deprecated
// and inconsistent, while TipTap gives structured HTML the sanitizer
// understands. Toolbar covers the EVENT-CREATION.md set: bold, italics,
// underline, alignment, bullets, numbering, sub/superscript, and links.
export function RichTextEditor({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (html: string) => void
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      LinkExtension.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        'aria-label': label,
        class:
          'min-h-full px-3 py-2 text-[13px] leading-6 outline-none [&_h1]:text-[18px] [&_h1]:font-bold [&_h2]:text-[16px] [&_h2]:font-bold [&_h3]:text-[14px] [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-semibold [&_a]:text-[#16a34a] [&_a]:underline',
      },
    },
    onUpdate: ({ editor: next }) => onChange(next.getHTML()),
  })

  function openLinkRow() {
    if (!editor) return
    setLinkUrl(editor.getAttributes('link').href ?? '')
    setLinkOpen(true)
  }

  // The editable element only fills its content, so clicks on the empty
  // area of the fixed-height box would land on dead space. Route those
  // clicks into the editor; clicks inside the text keep native caret
  // placement.
  function focusEmptyEditor(event: ReactMouseEvent<HTMLDivElement>) {
    if (editor && !(event.target as HTMLElement).closest('.tiptap')) {
      editor.commands.focus('end')
    }
  }

  function applyLink() {
    if (!editor) return
    const href = linkUrl.trim()
    if (href === '') {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href }).run()
    }
    setLinkOpen(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="toolbar"
        aria-label={`${label} formatting`}
        className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
      >
        <ToolButton editor={editor} label="Bold" active="bold" onPress={(e) => e.chain().focus().toggleBold().run()}>
          <Bold size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <ToolButton editor={editor} label="Italic" active="italic" onPress={(e) => e.chain().focus().toggleItalic().run()}>
          <Italic size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <ToolButton editor={editor} label="Underline" active="underline" onPress={(e) => e.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <ToolButton editor={editor} label="Align left" active={{ textAlign: 'left' }} onPress={(e) => e.chain().focus().setTextAlign('left').run()}>
          <AlignLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <ToolButton editor={editor} label="Align center" active={{ textAlign: 'center' }} onPress={(e) => e.chain().focus().setTextAlign('center').run()}>
          <AlignCenter size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <ToolButton editor={editor} label="Align right" active={{ textAlign: 'right' }} onPress={(e) => e.chain().focus().setTextAlign('right').run()}>
          <AlignRight size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <ToolButton editor={editor} label="Bulleted list" active="bulletList" onPress={(e) => e.chain().focus().toggleBulletList().run()}>
          <List size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <ToolButton editor={editor} label="Numbered list" active="orderedList" onPress={(e) => e.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <ToolButton editor={editor} label="Subscript" active="subscript" onPress={(e) => e.chain().focus().toggleSubscript().run()}>
          <SubscriptIcon size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <ToolButton editor={editor} label="Superscript" active="superscript" onPress={(e) => e.chain().focus().toggleSuperscript().run()}>
          <SuperscriptIcon size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <ToolButton editor={editor} label="Add link" active="link" onPress={() => openLinkRow()}>
          <Link2 size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
        <ToolButton
          editor={editor}
          label="Remove link"
          active={null}
          disabled={!editor?.isActive('link')}
          onPress={(e) => e.chain().focus().unsetLink().run()}
        >
          <Unlink size={15} strokeWidth={1.8} aria-hidden="true" />
        </ToolButton>
      </div>

      {linkOpen && editor && (
        <div className="flex gap-2">
          <Input
            aria-label="Link URL"
            value={linkUrl}
            placeholder="https://example.org"
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                applyLink()
              }
            }}
          />
          <button
            type="button"
            onClick={applyLink}
            className="inline-flex h-10 shrink-0 items-center rounded-lg bg-[#16a34a] px-4 text-[13px] font-bold text-white hover:bg-[#15803d]"
          >
            Apply
          </button>
        </div>
      )}

      <div
        onClick={focusEmptyEditor}
        className="h-[42vh] max-h-[520px] min-h-[280px] cursor-text overflow-y-auto rounded-lg border border-border bg-background focus-within:border-[#16a34a]"
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ToolButton({
  editor,
  label,
  active,
  disabled,
  onPress,
  children,
}: {
  editor: Editor | null
  label: string
  active: string | { textAlign: string } | null
  disabled?: boolean
  onPress: (editor: Editor) => void
  children: React.ReactNode
}) {
  const isActive =
    editor != null &&
    active != null &&
    (typeof active === 'string' ? editor.isActive(active) : editor.isActive(active))
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      disabled={editor == null || disabled}
      onClick={() => {
        if (editor) onPress(editor)
      }}
      className={cn(
        'flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60',
        isActive && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  )
}
