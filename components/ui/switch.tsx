'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-input px-0.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 data-[checked]:bg-[#16a34a]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-4 rounded-full bg-background shadow transition-transform data-[checked]:translate-x-4"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
