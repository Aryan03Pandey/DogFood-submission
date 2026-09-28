'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Field } from '@/components/console/field'

// Date + time picker built from shadcn primitives (Popover + Calendar plus
// a native time input). Value is an ISO string or null; the calendar works
// in local time, matching the previous datetime-local semantics.
export function DateTimeField({
  id,
  label,
  value,
  required,
  disabled,
  hint,
  error,
  onChange,
}: {
  id: string
  label: string
  value: string | null
  required?: boolean
  disabled?: boolean
  hint?: string
  error?: string | null
  onChange: (iso: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const current = value ? new Date(value) : undefined
  const timeValue =
    current && !Number.isNaN(current.getTime()) ? format(current, 'HH:mm') : '09:00'

  function pickDate(date: Date | undefined) {
    if (!date) {
      if (!required) onChange(null)
      setOpen(false)
      return
    }
    const [hours, minutes] = timeValue.split(':').map(Number)
    const composed = new Date(date)
    composed.setHours(hours || 0, minutes || 0, 0, 0)
    onChange(composed.toISOString())
    setOpen(false)
  }

  function pickTime(next: string) {
    const base = current && !Number.isNaN(current.getTime()) ? new Date(current) : new Date()
    const [hours, minutes] = next.split(':').map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return
    base.setHours(hours, minutes, 0, 0)
    onChange(base.toISOString())
  }

  return (
    <Field id={`${id}-trigger`} label={label} hint={hint} error={error} optional={!required}>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            id={`${id}-trigger`}
            disabled={disabled}
            aria-required={required}
            className={cn(
              'flex h-10 flex-1 items-center justify-start gap-2 rounded-lg border border-border bg-background px-3 text-left text-[13px] outline-none focus:border-[#16a34a] disabled:opacity-60',
              !current && 'text-muted-foreground',
            )}
          >
            <CalendarDays size={15} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            {current && !Number.isNaN(current.getTime()) ? format(current, 'PPP') : 'Pick a date'}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={current} onSelect={pickDate} autoFocus />
          </PopoverContent>
        </Popover>
        <input
          id={id}
          type="time"
          aria-label={`${label} time`}
          value={timeValue}
          disabled={disabled}
          onChange={(event) => pickTime(event.target.value)}
          className="h-10 w-28 shrink-0 rounded-lg border border-border bg-background px-2 text-[13px] outline-none focus:border-[#16a34a] disabled:opacity-60"
        />
        {!required && value && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
            Clear
          </Button>
        )}
      </div>
    </Field>
  )
}
