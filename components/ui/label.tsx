import * as React from 'react'

import { cn } from '@/lib/utils'

function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'flex flex-col gap-1 text-[12px] font-semibold text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
