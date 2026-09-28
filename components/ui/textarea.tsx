import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[#16a34a] disabled:opacity-60 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
