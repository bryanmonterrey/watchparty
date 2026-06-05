'use client';

import { cn } from '@/lib/utils';
import NumberFlow from '@number-flow/react';
import { Minus, Plus } from 'lucide-react';
import * as React from 'react';

type Props = {
    value?: number;
    min?: number;
    max?: number;
    onChange?: (value: number) => void;
    className?: string;
};

export function NumberInput({
    value = 0,
    min = -Infinity,
    max = Infinity,
    onChange,
    className
}: Props) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [animated, setAnimated] = React.useState(true);
    const [showCaret, setShowCaret] = React.useState(true);

    // Local state to handle intermediate values (like "1." or "") without fighting React props
    const [inputValue, setInputValue] = React.useState(String(value));

    // Sync local state when prop changes externally (but be careful not to overwrite typing)
    // We only sync if the numeric value differs, to allow formatting diffs (e.g. "1.0" vs 1)
    React.useEffect(() => {
        if (parseFloat(inputValue) !== value) {
            setInputValue(String(value));
        }
    }, [value]);

    const handleInput: React.ChangeEventHandler<HTMLInputElement> = ({
        currentTarget: el,
    }) => {
        setAnimated(false);
        setInputValue(el.value); // Always update local display immediately

        if (el.value === '') {
            onChange?.(0);
            return;
        }

        const num = parseFloat(el.value);
        if (isNaN(num)) return; // Don't emit invalid numbers

        if ((min != null && num < min) || (max != null && num > max)) {
            // Out of bounds? Don't update parent, but let local state exist?
            // Or revert? Reverting feels safer for "max"
            // For now, let's clamp on blur or just ignore
            return;
        }

        onChange?.(num);
    };

    const handlePointerDown = (diff: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
        setAnimated(true);
        if (event.pointerType === 'mouse') {
            event?.preventDefault();
            inputRef.current?.focus();
        }
        const newVal = Math.min(Math.max(value + diff, min), max);
        setInputValue(String(newVal));
        onChange?.(newVal);
    };

    return (
        <div className={cn('group flex items-center justify-center gap-6 w-full mx-auto', className)}>
            <button
                aria-hidden
                tabIndex={-1}
                className='flex items-center justify-center size-12 flex-shrink-0 rounded-full bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all active:scale-95 disabled:opacity-50'
                disabled={min != null && value <= min}
                onPointerDown={handlePointerDown(-0.1)}
            >
                <Minus className='size-6' absoluteStrokeWidth strokeWidth={3} />
            </button>

            {/* 
                Grid Layout for Auto-Width with Scroll:
                1. Wrapper is flex-1 with hidden scrollbar.
                2. Grid is w-fit to grow.
            */}
            <div className="flex-1 overflow-x-auto min-w-0 flex items-center justify-center px-2 hidden-scrollbar scroll-smooth">
                <div className="relative grid items-center justify-items-center text-center [grid-template-areas:'overlap'] *:[grid-area:overlap] w-fit mx-auto">
                    <input
                        ref={inputRef}
                        className={cn(
                            showCaret ? 'caret-white' : 'caret-transparent',
                            // w-full relative to the grid item, which grows with text
                            'w-full bg-transparent py-2 text-center font-[inherit] text-transparent outline-none appearance-none font-medium text-6xl',
                            '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                            'absolute inset-0 z-10' // Position over the NumberFlow
                        )}
                        style={{ fontKerning: 'none' }}
                        type='number'
                        min={min}
                        step={0.1}
                        autoComplete='off'
                        inputMode='decimal'
                        max={max}
                        value={inputValue}
                        onChange={handleInput}
                    />
                    <NumberFlow
                        value={value}
                        format={{ useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 2 }}
                        aria-hidden
                        animated={animated}
                        onAnimationsStart={() => setShowCaret(false)}
                        onAnimationsFinish={() => setShowCaret(true)}
                        className='pointer-events-none text-white text-6xl font-medium tracking-tight px-1 whitespace-nowrap'
                        willChange
                    />
                </div>
            </div>

            <button
                aria-hidden
                tabIndex={-1}
                className='flex items-center justify-center size-12 flex-shrink-0 rounded-full bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all active:scale-95 disabled:opacity-50'
                disabled={max != null && value >= max}
                onPointerDown={handlePointerDown(0.1)}
            >
                <Plus className='size-6' absoluteStrokeWidth strokeWidth={3} />
            </button>
        </div>
    );
}
