import React from 'react';

interface DayDividerProps {
    date: string;
}

export function DayDivider({ date }: DayDividerProps) {
    return (
        <div className="flex items-center justify-center my-4">
            <div className="bg-zinc-800/50 text-zinc-400 text-xs px-3 py-1 rounded-full">
                {date}
            </div>
        </div>
    );
}
