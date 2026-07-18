import type { ComponentType } from "react";
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
