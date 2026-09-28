'use client'

import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

function Select({
  items,
  ...props
}: SelectPrimitive.Root.Props<string, false> & { items?: Record<string, React.ReactNode> }) {
  return <SelectPrimitive.Root data-slot="select" items={items} {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-[#16a34a] disabled:opacity-60 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        data-slot="select-positioner"
        alignItemWithTrigger={false}
        sideOffset={4}
      >
        <SelectPrimitive.Popup
          data-slot="select-popup"
          className={cn(
            'max-h-64 min-w-36 overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg',
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'flex cursor-default items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] outline-none data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Check size={15} strokeWidth={2} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
