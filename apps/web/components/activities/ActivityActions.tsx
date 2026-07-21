import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export interface ActivityAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function ActivityActions({
  primary,
  secondary,
  remove,
  hint,
}: {
  primary: ActivityAction;
  secondary?: ActivityAction;
  remove?: ActivityAction;
  hint?: string;
}) {
  return (
    <div className="border-outline mt-6 flex items-center justify-end gap-3 border-t pt-4">
      {remove && (
        <button
          type="button"
          onClick={remove.onClick}
          disabled={remove.disabled}
          className="me-auto text-white hover:bg-red-800 flex items-center gap-2 rounded border bg-red-700 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {remove.loading ? <LoaderCircle className="animate-spin" size={16} /> : remove.icon}
          {remove.label}
        </button>
      )}
      {hint && <span className="text-ink-muted mr-auto text-xs">{hint}</span>}
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          disabled={secondary.disabled}
          className="border-outline text-ink hover:bg-canvas flex items-center gap-2 rounded border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {secondary.loading ? <LoaderCircle className="animate-spin" size={16} /> : secondary.icon}
          {secondary.label}
        </button>
      )}
      <button
        type="button"
        onClick={primary.onClick}
        disabled={primary.disabled}
        className="bg-primary flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
      >
        {primary.loading ? <LoaderCircle className="animate-spin" size={16} /> : primary.icon}
        {primary.label}
      </button>
    </div>
  );
}
