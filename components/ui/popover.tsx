'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = 'center',
  ...props
}: PopoverPrimitive.Popup.Props & { align?: 'start' | 'center' | 'end' }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner data-slot="popover-positioner" align={align} sideOffset={4}>
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverContent, PopoverTrigger }
