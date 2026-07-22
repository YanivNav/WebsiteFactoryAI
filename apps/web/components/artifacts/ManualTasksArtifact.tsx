import type { Artifact, ManualTasks } from "@factory/shared";
import { CircleHelp, ExternalLink, Wrench } from "lucide-react";

/** The build's questions + genuinely-manual setup steps. Informational for now. */
export function ManualTasksList({ items }: { items: ManualTasks["items"] }) {
  if (items.length === 0) return null;
  return (
    <section className="border-outline rounded border bg-white p-4">
      <h4 className="text-ink text-sm font-semibold">Needs your attention</h4>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item) => {
          const Icon = item.kind === "question" ? CircleHelp : Wrench;
          return (
            <li key={item.id} className="flex items-start gap-3">
              <Icon size={16} className="text-ink-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-ink text-sm font-medium">{item.title}</p>
                <p className="text-ink-muted text-xs">{item.detail}</p>
                {item.dashboardUrl && (
                  <a
                    className="text-primary mt-1 flex w-fit items-center gap-1 text-xs underline hover:no-underline"
                    href={item.dashboardUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open in Wix <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ManualTasksView({ artifact }: { artifact: Artifact<"manualTasks"> }) {
  const items = artifact.data.items;
  if (items.length === 0) {
    return <p className="text-ink-muted text-sm">Nothing needs your attention.</p>;
  }
  return <ManualTasksList items={items} />;
}
