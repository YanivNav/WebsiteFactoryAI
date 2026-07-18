import { Minus, Pencil, Plus } from "lucide-react";
import type { Artifact, Specification } from "@factory/shared";

type Change = {
  kind: "added" | "removed" | "changed";
  label: string;
};

export function SpecificationVersionChanges({
  current,
  previous,
}: {
  current: Artifact<"specification">;
  previous?: Artifact<"specification">;
}) {
  if (!previous) return null;

  const changes = compareSpecifications(previous.data, current.data);
  if (!changes.length && JSON.stringify(previous.data) === JSON.stringify(current.data))
    return null;

  return (
    <section className="border-outline rounded border bg-white p-4">
      <p className="text-ink-muted text-[10px] font-bold tracking-[0.1em] uppercase">
        Changes from Version {previous.version}
      </p>
      {changes.length ? (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {changes.map((change) => (
            <li
              className="text-ink flex items-center gap-2 text-sm"
              key={`${change.kind}-${change.label}`}
            >
              <ChangeIcon kind={change.kind} />
              <span>
                <span className="font-medium capitalize">{change.kind}</span> {change.label}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted mt-2 text-sm">Other site plan details were updated.</p>
      )}
    </section>
  );
}

function compareSpecifications(previous: Specification, current: Specification): Change[] {
  const changes: Change[] = [];
  compareNamedItems(changes, "page", pages(previous), pages(current), (page) => page.path);
  compareNamedItems(
    changes,
    "Wix feature",
    solutions(previous),
    solutions(current),
    (solution) => solution.name,
  );
  compareNamedItems(
    changes,
    "visitor flow",
    previous.visitorWorkflows,
    current.visitorWorkflows,
    (workflow) => workflow.name,
  );
  compareNamedItems(
    changes,
    "language",
    previous.languages,
    current.languages,
    (language) => language,
  );
  compareField(changes, "site header", previous.header, current.header);
  compareField(changes, "site footer", previous.footer, current.footer);
  compareField(changes, "design direction", previous.design, current.design);
  compareField(changes, "audience", previous.audience, current.audience);
  compareField(changes, "business goals", previous.businessModel, current.businessModel);
  return changes;
}

function compareField(changes: Change[], label: string, previous: unknown, current: unknown) {
  if (JSON.stringify(previous) !== JSON.stringify(current)) {
    changes.push({ kind: "changed", label });
  }
}

function compareNamedItems<T>(
  changes: Change[],
  noun: string,
  previousItems: T[],
  currentItems: T[],
  keyOf: (item: T) => string,
) {
  const previous = new Map(previousItems.map((item) => [keyOf(item), item]));
  const current = new Map(currentItems.map((item) => [keyOf(item), item]));

  for (const [key, item] of current) {
    if (!previous.has(key)) {
      changes.push({ kind: "added", label: `${noun} “${key}”` });
    } else if (JSON.stringify(previous.get(key)) !== JSON.stringify(item)) {
      changes.push({ kind: "changed", label: `${noun} “${key}”` });
    }
  }
  for (const key of previous.keys()) {
    if (!current.has(key)) changes.push({ kind: "removed", label: `${noun} “${key}”` });
  }
}

function pages(specification: Specification) {
  return [specification.homePage, ...specification.pages];
}

function solutions(specification: Specification) {
  return [
    ...(specification.businessSolutions.cms
      ? [{ name: "CMS Collections", details: specification.businessSolutions.cms }]
      : []),
    ...(specification.businessSolutions.stores
      ? [{ name: "Online Store", details: specification.businessSolutions.stores }]
      : []),
    ...specification.businessSolutions.others.map((solution) => ({
      name: solution.name,
      details: solution,
    })),
  ];
}

function ChangeIcon({ kind }: { kind: Change["kind"] }) {
  const className = "grid size-5 shrink-0 place-items-center rounded-full";
  if (kind === "added") {
    return (
      <span className={`${className} bg-[#def3e6] text-[#17693a]`}>
        <Plus size={13} />
      </span>
    );
  }
  if (kind === "removed") {
    return (
      <span className={`${className} bg-[#f8d9d6] text-[#a82922]`}>
        <Minus size={13} />
      </span>
    );
  }
  return (
    <span className={`${className} bg-[#fff0c2] text-[#755600]`}>
      <Pencil size={11} />
    </span>
  );
}
