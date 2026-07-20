import { useState, type ComponentType } from "react";
import type { Artifact, ArtifactType } from "@factory/shared";
import type { useUserTask } from "@/data/useUserTask";
import { QuestionnaireEditor, QuestionnaireResponseView } from "./QuestionnaireArtifact";
import { SpecificationArtifactView } from "./SpecificationArtifact";

type ArtifactContentProps = {
  artifact: Artifact;
  versions: Artifact[];
  subject?: Artifact;
};

export type ArtifactEditorProps = {
  artifact: Artifact;
  previousResult?: Artifact;
  busy: ReturnType<typeof useUserTask>["busy"];
  onSubmit: (data: unknown) => void;
  onRegenerate: () => void;
};

type ArtifactPresentation = {
  View?: ComponentType<ArtifactContentProps>;
  Editor?: ComponentType<ArtifactEditorProps>;
};

const ARTIFACT_PRESENTATIONS: Partial<Record<ArtifactType, ArtifactPresentation>> = {
  questionnaire: {
    Editor: ({ artifact, previousResult, ...actions }) => (
      <QuestionnaireEditor
        artifact={artifact as Artifact<"questionnaire">}
        previousResponse={previousResult as Artifact<"questionnaireResponse"> | undefined}
        {...actions}
      />
    ),
  },
  questionnaireResponse: {
    View: ({ artifact, subject }) =>
      subject?.type === "questionnaire" ? (
        <QuestionnaireResponseView
          questionnaire={subject}
          response={artifact as Artifact<"questionnaireResponse">}
        />
      ) : null,
  },
  specification: {
    View: ({ artifact, versions }) => (
      <SpecificationArtifactView
        artifact={artifact as Artifact<"specification">}
        versions={versions as Artifact<"specification">[]}
      />
    ),
  },
  design: {
    View: ({ artifact }) => <DesignArtifactView artifact={artifact as Artifact<"design">} />,
  },
};

export function ArtifactContent(props: ArtifactContentProps) {
  const View = ARTIFACT_PRESENTATIONS[props.artifact.type as ArtifactType]?.View;
  if (View) return <View {...props} />;
  return (
    <section className="border-outline rounded border bg-white p-5">
      <pre className="text-ink-muted overflow-auto text-xs">
        {JSON.stringify(props.artifact.data, null, 2)}
      </pre>
    </section>
  );
}

export function ArtifactEditor(props: ArtifactEditorProps) {
  const Editor = ARTIFACT_PRESENTATIONS[props.artifact.type as ArtifactType]?.Editor;
  if (Editor) return <Editor {...props} />;
  return (
    <section className="border-outline rounded border bg-white p-5 text-sm text-red-700">
      This artifact does not have an input editor yet.
    </section>
  );
}

function DesignArtifactView({ artifact }: { artifact: Artifact<"design"> }) {
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const screens = artifact.data.screens;
  const assetById = new Map(artifact.assets.map((a) => [a.id, a]));

  return (
    <>
      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-[-0.01em] text-[#2c3038]">
          Design Mockups
          <span className="font-normal text-xs text-[#687182]">
            ({screens.length} screen{screens.length !== 1 ? "s" : ""})
          </span>
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {screens.map((screen) => {
            const imageAsset = assetById.get(screen.imageAssetId);
            return (
              <div
                key={screen.path}
                className="group overflow-hidden rounded-lg border border-[#e1e3e6] bg-white transition-all duration-300 hover:border-[#adc6ff]"
              >
                <div className="relative aspect-[4/3] overflow-hidden border-b border-[#e1e3e6] bg-[#edeeef]">
                  {imageAsset?.url ? (
                    <>
                      <img
                        alt={`${screen.name} design`}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        src={imageAsset.url}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-[#0058be]/20 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="flex items-center gap-2 rounded bg-white px-4 py-2 text-xs font-semibold tracking-[0.05em] text-[#0058be] shadow-lg"
                          onClick={() => setZoomedUrl(imageAsset.url)}
                          type="button"
                        >
                          <span className="text-base leading-none">&crarr;</span>
                          ENLARGE
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[#727785]">
                      No preview
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h4 className="text-sm font-semibold text-[#2c3038]">{screen.name}</h4>
                  <p className="text-[11px] text-[#727785]">{screen.path}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {zoomedUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm"
          onClick={() => setZoomedUrl(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setZoomedUrl(null);
          }}
          role="dialog"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e1e3e6] p-4">
              <h3 className="text-sm font-semibold text-[#2c3038]">Design Preview</h3>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[#edeeef]"
                onClick={() => setZoomedUrl(null)}
                type="button"
              >
                <span className="text-xl leading-none text-[#727785]">&times;</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-[#f8f9fa] p-8">
              <img
                alt="Design preview"
                className="mx-auto max-w-full border border-[#e1e3e6] shadow-lg"
                src={zoomedUrl}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
