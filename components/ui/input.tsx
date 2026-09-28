import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type = 'text', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'h-10 rounded-lg border border-border bg-background px-3 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[#16a34a] disabled:opacity-60 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
