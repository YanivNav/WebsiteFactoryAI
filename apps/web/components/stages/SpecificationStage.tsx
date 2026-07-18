import type { StageViewProps } from "./StageUI";
import type { SpecPage } from "@factory/shared";
import { useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Database,
  PencilLine,
  Puzzle,
  ShoppingCart,
  Tag,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { useStageGate } from "@/data/useStageGate";
import { StageActions } from "./StageActions";
import { ArtifactVersionPicker } from "@/components/ArtifactVersionPicker";
import { SpecificationVersionChanges } from "./SpecificationVersionChanges";
import type { Id } from "@convex/_generated/dataModel";

// Known solutions get a friendly label + icon; anything the plan names that isn't
// listed here falls back to the raw name with a generic icon.
const SOLUTION_META: Record<string, { label: string; Icon: ComponentType<{ size?: number }> }> = {
  cms: { label: "CMS Collections", Icon: Database },
  stores: { label: "Online Store", Icon: ShoppingCart },
  crm: { label: "CRM", Icon: Users },
  bookings: { label: "Bookings", Icon: Calendar },
  forms: { label: "Forms", Icon: ClipboardList },
  blog: { label: "Blog", Icon: BookOpen },
  pricingPlans: { label: "Pricing Plans", Icon: Tag },
};

function solutionBadge(name: string) {
  return SOLUTION_META[name] ?? { label: name, Icon: Puzzle };
}

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

export function SpecificationStage({ detail }: StageViewProps) {
  const { submit, regenerate, busy } = useStageGate(detail.project._id);
  const versions = detail.artifacts.specification ?? [];
  const selectedArtifactId = detail.selectedArtifactIds.specification;
  const selectedArtifact =
    versions.find((artifact) => artifact.id === selectedArtifactId) ?? versions[0];
  const previousArtifact = selectedArtifact?.sourceArtifactId
    ? versions.find((artifact) => artifact.id === selectedArtifact.sourceArtifactId)
    : versions.find((artifact) => artifact.version < (selectedArtifact?.version ?? 0));
  const spec = selectedArtifact?.data;
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState("");

  if (!spec) return null;

  const { cms, stores, others } = spec.businessSolutions;
  const pages = [spec.homePage, ...spec.pages];
  const solutionNames = [
    ...(cms ? ["cms"] : []),
    ...(stores ? ["stores"] : []),
    ...others.map((o) => o.name),
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="border-outline rounded border bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-ink text-lg font-semibold">Site Plan Summary</h2>
          <span className="text-primary flex shrink-0 items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase">
            <BadgeCheck size={16} /> Ready for review
          </span>
        </div>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">{spec.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {solutionNames.map((name, i) => {
            const { label, Icon } = solutionBadge(name);
            return (
              <span
                key={i}
                className="border-outline bg-canvas text-ink flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium"
              >
                <Icon size={14} /> {label}
              </span>
            );
          })}
          {spec.languages.map((language) => (
            <span
              key={language}
              className="border-outline bg-canvas text-ink-muted rounded border px-2.5 py-1 text-xs"
            >
              {language}
            </span>
          ))}
        </div>
        <div className="border-outline mt-4 border-t pt-4">
          <ArtifactVersionPicker
            label="Site plan versions"
            projectId={detail.project._id}
            selectedArtifactId={selectedArtifact?.id}
            versions={versions}
          />
        </div>
      </section>

      {selectedArtifact && (
        <SpecificationVersionChanges current={selectedArtifact} previous={previousArtifact} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {pages.map((page, i) => (
          <PageCard key={`${page.path}-${i}`} page={page} />
        ))}
      </div>

      {revising && (
        <section className="border-outline rounded border bg-white p-4">
          <label className="text-ink text-sm font-medium">What should change?</label>
          <textarea
            autoFocus
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe the changes the site plan should address…"
            className="border-outline bg-canvas text-ink placeholder:text-ink-muted focus:border-primary focus:ring-primary mt-2 block w-full rounded border px-3 py-2 text-sm outline-none focus:ring-1"
          />
        </section>
      )}

      <StageActions
        primary={{
          label: "Approve Site Plan",
          icon: <CheckCircle2 size={16} />,
          onClick: () =>
            void submit(undefined, selectedArtifact?.id as Id<"artifacts"> | undefined),
          loading: busy === "submit",
          disabled: busy !== null,
        }}
        secondary={
          revising
            ? {
                label: "Send changes",
                onClick: () =>
                  void regenerate(feedback, selectedArtifact?.id as Id<"artifacts"> | undefined),
                loading: busy === "regenerate",
                disabled: busy !== null || !feedback.trim(),
              }
            : {
                label: "Request changes",
                icon: <PencilLine size={16} />,
                onClick: () => setRevising(true),
                disabled: busy !== null,
              }
        }
      />
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
            {page.sections.map((section, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-ink-muted">•</span>
                <span>
                  <span className="text-ink font-medium">
                    {SECTION_LABEL[section.type] ?? section.type}
                  </span>
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
