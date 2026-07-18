import type { Specification } from "@factory/shared";
import { CheckCircle2, Route, Settings2 } from "lucide-react";

type VisitorWorkflow = Specification["visitorWorkflows"][number];
type WorkflowAction = VisitorWorkflow["steps"][number]["action"];

const ACTION_LABELS: Record<WorkflowAction["type"], string> = {
  goToPage: "Open page",
  selectFromDropdown: "Choose option",
  fillForm: "Enter details",
  pressButton: "Select action",
  fetchData: "Load content",
  changeFilter: "Update results",
  updateElement: "Update page",
  callBackend: "Submit securely",
  navigateToPage: "Continue to page",
  addToCart: "Add to cart",
  createCmsItem: "Save content",
  editCmsItem: "Update content",
  deleteCmsItem: "Remove content",
  sendTriggeredEmail: "Send email",
  callExternalAPI: "Connect service",
  sendAdminEmail: "Notify site team",
  createContact: "Create contact",
};

export function VisitorWorkflows({ workflows }: { workflows: VisitorWorkflow[] }) {
  if (workflows.length === 0) return null;

  return (
    <section className="border-outline rounded border bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded">
          <Route size={18} />
        </span>
        <div>
          <h2 className="text-ink text-lg font-semibold">How visitors use the site</h2>
          <p className="text-ink-muted mt-1 text-sm">
            The key journeys the finished site needs to support from start to finish.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {workflows.map((workflow, workflowIndex) => (
          <article
            className="border-outline bg-canvas/40 flex flex-col rounded border p-4"
            key={`${workflow.name}-${workflowIndex}`}
          >
            <div>
              <h3 className="text-ink text-base font-semibold">{workflow.name}</h3>
              <p className="text-ink-muted mt-1 text-sm leading-relaxed">{workflow.description}</p>
            </div>

            <ol className="mt-4 flex flex-col">
              {workflow.steps.map((step, stepIndex) => (
                <li className="relative flex gap-3 pb-4 last:pb-0" key={stepIndex}>
                  {stepIndex < workflow.steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="bg-outline absolute top-6 bottom-0 left-[11px] w-px"
                    />
                  )}
                  <span className="border-primary text-primary relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-white text-[11px] font-bold">
                    {stepIndex + 1}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-ink text-sm leading-relaxed">{step.description}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="border-outline text-ink-muted rounded border bg-white px-2 py-0.5 text-[11px] font-medium">
                        {ACTION_LABELS[step.action.type]}
                      </span>
                      {step.requiresManualSetup && (
                        <span className="text-ink-muted flex items-center gap-1 text-[11px] font-medium">
                          <Settings2 size={12} /> Wix setup needed
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="border-outline mt-4 flex gap-2 border-t pt-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-[#17693a]" size={16} />
              <p className="text-ink text-sm">
                <span className="font-semibold">Outcome:</span> {workflow.result}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
