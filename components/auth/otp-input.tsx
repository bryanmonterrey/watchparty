"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Squircle } from "@/components/ui/squircle";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  autoFocus,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const focusAt = (i: number) =>
    refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const handleChange = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    const arr = value.split("");
    let idx = i;
    for (const ch of digits) {
      if (idx >= length) break;
      arr[idx++] = ch;
    }
    commit(arr.join(""));
    focusAt(idx);
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = value.split("");
      if (arr[i]) {
        arr[i] = "";
        commit(arr.join(""));
      } else if (i > 0) {
        arr[i - 1] = "";
        commit(arr.join(""));
        focusAt(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      focusAt(i - 1);
    } else if (e.key === "ArrowRight") {
      focusAt(i + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    commit(text);
    focusAt(text.replace(/\D/g, "").slice(0, length).length);
  };

  return (
    <div className="flex justify-between gap-2 sm:gap-2.5" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <Squircle key={i} asChild radius={18} autoEffects={false}>
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={autoFocus && i === 0}
            maxLength={1}
            disabled={disabled}
            aria-label={`Digit ${i + 1}`}
            value={value[i] ?? ""}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(
              "h-14 w-full bg-[#6A6A6A]/35 text-center text-xl font-semibold text-white caret-white outline-none transition-colors sm:h-[61px]",
              "focus:bg-[#6A6A6A]/70",
              value[i] && "bg-[#6A6A6A]/55",
            )}
          />
        </Squircle>
      ))}
    </div>
  );
}
