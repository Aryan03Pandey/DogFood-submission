'use client'

import { useEffect, useState } from 'react'
import { Laptop, Monitor, Smartphone } from 'lucide-react'

import { cn } from '@/lib/utils'
import { EventPreview } from '@/components/console/event-preview'
import type { WizardData } from '@/src/lib/event-creation'

const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: '100%', icon: Monitor },
  { id: 'laptop', label: 'Laptop', width: 1024, icon: Laptop },
  { id: 'mobile', label: 'Mobile', width: 390, icon: Smartphone },
] as const

type DeviceId = (typeof DEVICES)[number]['id']

// Device-switchable preview frame (EVENT-CREATION.md). Defaults to the
// visitor's size class; the framed EventPreview is the same component as
// the wizard side pane, so what is approved here is what ships.
export function PreviewShell({
  data,
  trackNames,
  dateRange,
}: {
  data: WizardData
  trackNames: Record<string, string>
  dateRange: string | null
}) {
  const [device, setDevice] = useState<DeviceId>('desktop')

  useEffect(() => {
    const width = window.innerWidth
    setDevice(width < 700 ? 'mobile' : width < 1300 ? 'laptop' : 'desktop')
  }, [])

  const active = DEVICES.find((entry) => entry.id === device)!

  return (
    <div>
      <div
        role="toolbar"
        aria-label="Preview device size"
        className="flex w-fit gap-1 rounded-lg bg-muted p-1"
      >
        {DEVICES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={device === entry.id}
            onClick={() => setDevice(entry.id)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-bold transition-colors',
              device === entry.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <entry.icon size={15} strokeWidth={1.8} aria-hidden="true" />
            {entry.label}
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-background p-4">
        <div
          className="mx-auto w-full"
          style={typeof active.width === 'number' ? { maxWidth: active.width } : undefined}
        >
          <EventPreview data={data} trackNames={trackNames} dateRange={dateRange} />
        </div>
      </div>
    </div>
  )
}
