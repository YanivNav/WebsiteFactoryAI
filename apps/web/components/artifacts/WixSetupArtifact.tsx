import { useState } from "react";
import {
  WIX_HOSTING_LABELS,
  type Artifact,
  type WixHosting,
  type WixSetupPlan,
} from "@factory/shared";
import { Check, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { ActivityActions } from "../activities/ActivityActions";

const HOSTING_BLURB: Record<WixHosting, string> = {
  wixManaged: "Wix hosts and runs the site. Fastest way to go live, everything in one dashboard.",
  selfManaged:
    "The site runs on hosting outside Wix, while Wix still powers the business features.",
};

/** The "Choose your Wix setup" task: pick a hosting option, guided by the AI plan. */
export function WixSetupPlanEditor({
  artifact,
  previousResult,
  busy,
  onSubmit,
  onRegenerate,
}: {
  artifact: Artifact<"wixSetupPlan">;
  previousResult?: Artifact<"wixSetupDecision">;
  busy: string | null;
  onSubmit: (data: unknown) => void;
  onRegenerate: () => void;
}) {
  const plan = artifact.data;
  const [hosting, setHosting] = useState<WixHosting>(
    previousResult?.data.hosting ?? plan.recommendation,
  );

  return (
    <>
      <section className="border-outline rounded border bg-white p-4">
        <p className="text-ink flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="text-primary" size={16} />
          Our recommendation: {WIX_HOSTING_LABELS[plan.recommendation]}
        </p>
        <p className="text-ink-muted mt-2 text-sm">{plan.summary}</p>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(Object.keys(WIX_HOSTING_LABELS) as WixHosting[]).map((option) => {
          const selected = hosting === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setHosting(option)}
              className={`rounded border p-4 text-left transition-colors ${
                selected
                  ? "border-primary bg-[#d8e2ff]"
                  : "border-outline bg-white hover:bg-[#eceef2]"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="text-ink text-sm font-semibold">
                  {WIX_HOSTING_LABELS[option]}
                  {option === plan.recommendation && (
                    <span className="text-primary ms-2 text-[11px] font-medium">Recommended</span>
                  )}
                </span>
                {selected && <Check className="text-primary" size={16} />}
              </span>
              <span className="text-ink-muted mt-1 block text-xs">{HOSTING_BLURB[option]}</span>
            </button>
          );
        })}
      </div>

      {plan.factors.length > 0 && <FactorsTable factors={plan.factors} />}

      <ActivityActions
        primary={{
          label: `Continue with ${WIX_HOSTING_LABELS[hosting]}`,
          icon: <Check size={16} />,
          loading: busy === "complete",
          disabled: busy !== null,
          onClick: () => onSubmit({ hosting }),
        }}
        secondary={{
          label: "Regenerate advice",
          icon: <RefreshCw size={16} />,
          loading: busy === "revise",
          disabled: busy !== null,
          onClick: onRegenerate,
        }}
      />
    </>
  );
}

/** Read-only rendering of the plan (completed tasks, version browsing). */
export function WixSetupPlanView({ artifact }: { artifact: Artifact<"wixSetupPlan"> }) {
  const plan = artifact.data;
  return (
    <div className="flex flex-col gap-4">
      <section className="border-outline rounded border bg-white p-4">
        <p className="text-ink text-sm font-semibold">
          Recommendation: {WIX_HOSTING_LABELS[plan.recommendation]}
        </p>
        <p className="text-ink-muted mt-2 text-sm">{plan.summary}</p>
      </section>
      {plan.factors.length > 0 && <FactorsTable factors={plan.factors} />}
    </div>
  );
}

function FactorsTable({ factors }: { factors: WixSetupPlan["factors"] }) {
  return (
    <section className="border-outline mt-4 overflow-hidden rounded border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-outline text-ink-muted border-b bg-[#f8f9fa] text-left text-xs">
            <th className="px-4 py-2 font-medium">What your site needs</th>
            <th className="px-4 py-2 font-medium">Wix-managed</th>
            <th className="px-4 py-2 font-medium">Self-managed</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((factor) => (
            <tr key={factor.capability} className="border-outline border-b last:border-b-0">
              <td className="text-ink px-4 py-2 font-medium">{factor.capability}</td>
              <td
                className={`px-4 py-2 ${factor.favors === "wixManaged" ? "text-[#17693a]" : "text-ink-muted"}`}
              >
                {factor.wixManaged}
              </td>
              <td
                className={`px-4 py-2 ${factor.favors === "selfManaged" ? "text-[#17693a]" : "text-ink-muted"}`}
              >
                {factor.selfManaged}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function WixSetupDecisionView({ artifact }: { artifact: Artifact<"wixSetupDecision"> }) {
  return (
    <section className="border-outline rounded border bg-white p-4">
      <p className="text-ink text-sm font-semibold">
        Hosting choice: {WIX_HOSTING_LABELS[artifact.data.hosting]}
      </p>
      <p className="text-ink-muted mt-1 text-xs">{HOSTING_BLURB[artifact.data.hosting]}</p>
    </section>
  );
}

/** The provisioned project: dashboard, live site, backup, and remaining steps. */
export function WixProjectView({ artifact }: { artifact: Artifact<"wixProject"> }) {
  const project = artifact.data;
  return (
    <div className="flex flex-col gap-4">
      <section className="border-outline rounded border bg-white p-4">
        <p className="text-ink text-sm font-semibold">
          {WIX_HOSTING_LABELS[project.hosting]} Wix site
        </p>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {project.wix.dashboardUrl && (
            <ProjectLink href={project.wix.dashboardUrl} label="Open your Wix dashboard" />
          )}
          {project.wix.liveUrl && (
            <ProjectLink href={project.wix.liveUrl} label="View your live site" />
          )}
          <ProjectLink href={project.repository.url} label="Code backup (GitHub)" />
        </div>
      </section>

      {project.pendingSetup && project.pendingSetup.length > 0 && (
        <section className="border-outline rounded border bg-white p-4">
          <p className="text-ink text-sm font-semibold">A couple of steps only you can do</p>
          <ol className="mt-3 flex list-decimal flex-col gap-3 ps-5">
            {project.pendingSetup.map((step) => (
              <li key={step.title}>
                <p className="text-ink text-sm font-medium">{step.title}</p>
                <p className="text-ink-muted mt-0.5 text-xs">{step.instructions}</p>
                {step.url && <ProjectLink href={step.url} label="Open" />}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function ProjectLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="text-primary flex w-fit items-center gap-1 underline hover:no-underline"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label} <ExternalLink size={13} />
    </a>
  );
}
