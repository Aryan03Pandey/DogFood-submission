import * as React from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Shared labeled-field shell for console forms: label, control, optional
// hint, and a single inline error slot. Every input in the creation wizard
// renders through this so labels and errors stay uniform.
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string | null
  optional?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={id}>
        <span>
          {label}
          {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </span>
      </Label>
      {children}
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-[11px] font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
