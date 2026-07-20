import type { Artifact, SpecPage } from "@factory/shared";
import {
  BadgeCheck,
  BookOpen,
  Calendar,
  ClipboardList,
  Database,
  Puzzle,
  ShoppingCart,
  Tag,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { SpecificationVersionChanges } from "./SpecificationVersionChanges";
import { VisitorWorkflows } from "./VisitorWorkflows";

const SOLUTION_META: Record<string, { label: string; Icon: ComponentType<{ size?: number }> }> = {
  cms: { label: "CMS Collections", Icon: Database },
  stores: { label: "Online Store", Icon: ShoppingCart },
  crm: { label: "CRM", Icon: Users },
  bookings: { label: "Bookings", Icon: Calendar },
  forms: { label: "Forms", Icon: ClipboardList },
  blog: { label: "Blog", Icon: BookOpen },
  pricingPlans: { label: "Pricing Plans", Icon: Tag },
};

const SECTION_LABEL: Record<SpecPage["sections"][number]["type"], string> = {
  hero: "Hero",
  cards: "Cards",
  table: "Table",
  gallery: "Gallery",
  blog: "Blog",
  form: "Form",
  map: "Map",
  share: "Share",
  video: "Video",
  image: "Image",
};

export function SpecificationArtifactView({
  artifact,
  versions,
}: {
  artifact: Artifact<"specification">;
  versions: Artifact<"specification">[];
}) {
  const spec = artifact.data;
  const previous = artifact.basedOnArtifactId
    ? versions.find((version) => version.id === artifact.basedOnArtifactId)
    : versions.find((version) => version.version < artifact.version);
  const pages = [spec.homePage, ...spec.pages];
  const { cms, stores, others } = spec.businessSolutions;
  const solutions = [
    ...(cms ? ["cms"] : []),
    ...(stores ? ["stores"] : []),
    ...others.map((solution) => solution.name),
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="border-outline rounded border bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-ink text-lg font-semibold">Site Plan Summary</h2>
          <span className="text-primary flex shrink-0 items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase">
            <BadgeCheck size={16} /> Version {artifact.version}
          </span>
        </div>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">{spec.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {solutions.map((name, index) => {
            const { label, Icon } = SOLUTION_META[name] ?? { label: name, Icon: Puzzle };
            return (
              <span
                className="border-outline bg-canvas text-ink flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium"
                key={`${name}-${index}`}
              >
                <Icon size={14} /> {label}
              </span>
            );
          })}
          {spec.languages.map((language) => (
            <span
              className="border-outline bg-canvas text-ink-muted rounded border px-2.5 py-1 text-xs"
              key={language}
            >
              {language}
            </span>
          ))}
        </div>
      </section>

      <SpecificationVersionChanges current={artifact} previous={previous} />

      <div className="grid gap-4 md:grid-cols-2">
        {pages.map((page, index) => (
          <PageCard key={`${page.path}-${index}`} page={page} />
        ))}
      </div>

      <VisitorWorkflows workflows={spec.visitorWorkflows} />
    </div>
  );
}

function PageCard({ page }: { page: SpecPage }) {
  return (
    <div className="border-outline rounded border bg-white p-4">
      <div className="border-outline mb-3 flex items-baseline justify-between gap-3 border-b pb-2">
        <h3 className="text-ink text-base font-semibold">{page.name}</h3>
        <span className="text-ink-muted shrink-0 font-mono text-xs">{page.path}</span>
      </div>
      <p className="border-primary text-ink-muted border-l-2 pl-3 text-sm">{page.description}</p>
      {page.sections.length > 0 && (
        <div className="mt-4">
          <p className="text-ink-muted mb-2 text-[10px] font-bold tracking-widest uppercase">
            Sections
          </p>
          <ul className="flex flex-col gap-1">
            {page.sections.map((section, index) => (
              <li className="flex gap-2 text-sm" key={index}>
                <span className="text-ink-muted">•</span>
                <span>
                  <span className="text-ink font-medium">{SECTION_LABEL[section.type]}</span>
                  {section.description && (
                    <span className="text-ink-muted"> — {section.description}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
