import {LoaderCircle} from "lucide-react";
import type {ReactNode} from "react";

export interface StageAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

/**
 * The footer every waiting gate renders: one primary action (accept / continue)
 * and an optional secondary action (regenerate / revise). Shared so each stage
 * only decides the labels and what the actions do.
 */
export function StageActions({primary, secondary, hint}: {primary: StageAction; secondary?: StageAction; hint?: string}) {
  return <div className="mt-6 flex items-center justify-end gap-3 border-t border-outline pt-4">
    {hint && <span className="mr-auto text-xs text-ink-muted">{hint}</span>}
    {secondary && <button type="button" onClick={secondary.onClick} disabled={secondary.disabled}
      className="flex items-center gap-2 rounded border border-outline bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50">
      {secondary.loading ? <LoaderCircle className="animate-spin" size={16} /> : secondary.icon}
      {secondary.label}
    </button>}
    <button type="button" onClick={primary.onClick} disabled={primary.disabled}
      className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50">
      {primary.loading ? <LoaderCircle className="animate-spin" size={16} /> : primary.icon}
      {primary.label}
    </button>
  </div>
}
