"use client";

import * as React from "react";

// Opt-in native haptic feedback on tap (the project-fathom technique).
//
// iOS Safari/Chrome don't support the Vibration API, but a *direct tap* on a
// native `<input type="checkbox" switch>` fires a system haptic tick (iOS 17.4+).
// So we overlay an invisible native switch as the real tap target. Android uses
// the Vibration API; desktop is a no-op. iOS only fires on a direct tap (not
// from script), which is why this is a wrapper, not a plain function call.
//
// Usage: drop-in for <button>, but `onClick` takes no event:
//   <HapticButton className="…" onClick={() => doThing()}>Continue</HapticButton>
// Pass `haptic={false}` (or `disabled`) to render a plain <button> instead.
//
// Note: when haptics are on, the styled element is a <span> with an overlaid
// switch — so `enabled:`/`disabled:` Tailwind variants (which only match form
// controls) won't apply. Use plain conditional classes for those buttons.

type HapticButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  haptic?: boolean;
  onClick?: () => void;
};

export function HapticButton({
  haptic = true,
  onClick,
  children,
  className,
  type = "button",
  disabled,
  "aria-label": ariaLabel,
  ...rest
}: HapticButtonProps) {
  const switchRef = React.useRef<HTMLInputElement>(null);

  // `switch` is a WebKit boolean attribute React doesn't type — set it directly.
  React.useEffect(() => {
    switchRef.current?.setAttribute("switch", "");
  }, [haptic]);

  if (!haptic || disabled) {
    return (
      <button type={type} onClick={onClick} className={className} disabled={disabled} aria-label={ariaLabel} {...rest}>
        {children}
      </button>
    );
  }

  function fire() {
    // Android (+ some Chromium). iOS already buzzed from the native tap itself.
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(8);
    }
    onClick?.();
  }

  const label = ariaLabel ?? (typeof children === "string" ? children : undefined);

  // The wrapper itself carries the button styles; an invisible native switch
  // overlays it as the real tap target (so iOS fires a haptic on direct tap).
  return (
    <span className={`relative isolate ${className ?? ""}`}>
      {children}
      <input
        ref={switchRef}
        type="checkbox"
        role="button"
        aria-label={label}
        onChange={fire}
        className="absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
      />
    </span>
  );
}
