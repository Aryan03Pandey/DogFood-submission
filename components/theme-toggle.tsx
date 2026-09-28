'use client'

import { useCallback, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

import { cn } from '@/lib/utils'

export const THEME_STORAGE_KEY = 'dogfood-theme'

function resolveTheme(): 'light' | 'dark' {
  const root = document.documentElement
  if (root.classList.contains('dark')) return 'dark'
  if (root.classList.contains('light')) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Private mode / blocked storage: theme still applies for this page load.
  }
}

// Global light/dark toggle. Flips the `light`/`dark` class on <html> (which
// app/globals.css maps to theme tokens), so every token-styled surface on
// every page follows. Explicit choice persists in localStorage; with no
// stored choice the OS preference wins via the blocking script in
// app/layout.tsx. Initial render matches the server (moon icon) and syncs on
// mount, so there is no hydration mismatch.
export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    setTheme(resolveTheme())
  }, [])

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return next
    })
  }, [])

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {theme === 'dark' ? (
        <Sun size={18} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Moon size={18} strokeWidth={1.8} aria-hidden="true" />
      )}
    </button>
  )
}
