'use client'

import { Minus, Plus } from 'lucide-react'

// Stepped number input for team-size bounds (EVENT-CREATION.md: "use
// counter for min and max fields"). Buttons and typed entry stay in sync
// through the same clamped onChange.
export function Counter({
  id,
  value,
  min = 1,
  max,
  disabled,
  onChange,
}: {
  id: string
  value: number
  min?: number
  max?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  function clamp(next: number): number {
    if (!Number.isSafeInteger(next)) return value
    if (next < min) return min
    if (max !== undefined && next > max) return max
    return next
  }

  const btn =
    'flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        id={`${id}-minus`}
        aria-label="Decrease"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className={btn}
      >
        <Minus size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clamp(Number.parseInt(event.target.value, 10)))}
        aria-label="Value"
        className="h-10 w-20 rounded-lg border border-border bg-background px-3 text-center text-[13px] outline-none focus:border-[#16a34a] disabled:opacity-60"
      />
      <button
        type="button"
        id={`${id}-plus`}
        aria-label="Increase"
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={() => onChange(clamp(value + 1))}
        className={btn}
      >
        <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}
