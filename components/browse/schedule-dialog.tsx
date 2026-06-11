"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ScheduleDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (date: Date) => void;
}

export function ScheduleDialog({ open, onClose, onConfirm }: ScheduleDialogProps) {
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [time, setTime] = useState("12:00");

    const handleConfirm = () => {
        if (!date) return;
        const [hours, minutes] = time.split(":").map(Number);
        const scheduled = new Date(date);
        scheduled.setHours(hours, minutes, 0, 0);
        if (scheduled <= new Date()) return;
        onConfirm(scheduled);
        onClose();
    };

    const minDate = new Date();
    minDate.setDate(minDate.getDate()); // today

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="bg-black border-white/10 max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-zinc-100">Schedule post</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={d => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        className="rounded-xl border border-white/10 bg-zinc-900/40 p-3"
                    />
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-zinc-400">Time</label>
                        <input
                            type="time"
                            value={time}
                            onChange={e => setTime(e.target.value)}
                            className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/30"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-zinc-100">Cancel</Button>
                    <Button
                        disabled={!date}
                        onClick={handleConfirm}
                        className="bg-white text-black hover:bg-zinc-200 font-bold"
                    >
                        Schedule
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
