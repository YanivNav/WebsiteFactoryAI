"use client";

import { useState } from "react";

/**
 * A trigger that reveals an inline confirm row instead of a native dialog.
 * Never use `window.confirm`/`alert`/`prompt` — build in-app confirmation.
 */
export function ConfirmAction({
  label,
  message,
  confirmLabel = "Confirm",
  className,
  disabled,
  onConfirm,
}: {
  label: string;
  message: string;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-muted">{message}</span>
      <button
        type="button"
        className="text-primary font-medium underline hover:no-underline disabled:opacity-50"
        disabled={disabled}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="text-ink-muted underline hover:no-underline"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </span>
  );
}
