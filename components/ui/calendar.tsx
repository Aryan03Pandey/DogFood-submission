'use client'

import { DayPicker } from 'react-day-picker'

import { cn } from '@/lib/utils'

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col gap-4',
        month: 'flex flex-col gap-3',
        month_caption: 'flex items-center justify-between px-1',
        caption_label: 'text-[13px] font-bold text-foreground',
        nav: 'flex items-center gap-1',
        button_previous:
          'flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        button_next:
          'flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 rounded-lg text-[11px] font-semibold text-muted-foreground',
        weeks: '',
        week: 'flex w-full',
        day: 'p-0 text-center text-[13px]',
        day_button:
          'flex size-9 items-center justify-center rounded-lg p-0 font-normal transition-colors hover:bg-muted',
        selected: 'bg-[#16a34a]! text-white! hover:bg-[#15803d]!',
        today: 'border border-border',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      {...props}
    />
  )
}

export { Calendar }
