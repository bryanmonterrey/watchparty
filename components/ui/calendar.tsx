"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import "react-day-picker/dist/style.css"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn("p-3", className)}
            classNames={{
                months: "relative flex flex-col sm:flex-row gap-4",
                month: "space-y-4",
                month_caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "absolute flex flex-row items-center w-[calc(100%-24px)] justify-between z-10 px-1 pointer-events-none",
                button_previous: cn(
                    buttonVariants({ variant: "outline" }),
                    "h-7 w-7 bg-transparent p-0 text-muted-foreground hover:opacity-100 hover:bg-zinc-800 hover:text-white pointer-events-auto"
                ),
                button_next: cn(
                    buttonVariants({ variant: "outline" }),
                    "h-7 w-7 bg-transparent p-0 text-muted-foreground hover:opacity-100 hover:bg-zinc-800 hover:text-white pointer-events-auto"
                ),
                month_grid: "w-full border-collapse space-y-1",
                weekdays: "flex",
                weekday:
                    "text-zinc-500 rounded-md w-9 font-normal text-[0.8rem]",
                week: "flex w-full mt-2",
                day: "h-9 w-9 text-center text-sm p-0 flex items-center justify-center relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-zinc-800/50 [&:has([aria-selected])]:bg-zinc-800 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day_button: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-full w-full p-0 font-normal aria-selected:opacity-100 hover:bg-zinc-800 hover:text-white"
                ),
                range_end: "day-range-end",
                selected:
                    "bg-white text-zinc-900 hover:bg-white hover:text-zinc-900 focus:bg-white focus:text-zinc-900",
                today: "bg-zinc-800 text-white",
                outside:
                    "day-outside text-zinc-500 opacity-50 aria-selected:bg-zinc-800/50 aria-selected:text-zinc-500 aria-selected:opacity-30",
                disabled: "text-zinc-500 opacity-50",
                range_middle:
                    "aria-selected:bg-zinc-800 aria-selected:text-white",
                hidden: "invisible",
                ...classNames,
            }}
            components={{
                Chevron: ({ ...props }) => {
                    if (props.orientation === 'left') {
                        return <ChevronLeft className="h-4 w-4" {...props} />
                    }
                    return <ChevronRight className="h-4 w-4" {...props} />
                }
            }}
            {...props}
        />
    )
}
Calendar.displayName = "Calendar"

export { Calendar }
