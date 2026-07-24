import {type ComponentType} from "react";
import type {Artifact, ArtifactType} from "@factory/shared";
import type {Id} from "@convex/_generated/dataModel";
import type {ProjectDetail} from "@/data/useProjectDetail";
import type {useUserTask} from "@/data/useUserTask";
import {QuestionnaireEditor, QuestionnaireResponseView} from "../artifacts/QuestionnaireArtifact";
import {SpecificationArtifactView} from "../artifacts/spec/SpecificationArtifact";
import {DesignArtifact} from "@/components/artifacts/DesignArtifact";
import {
  WixProjectView,
  WixSetupDecisionView,
  WixSetupPlanEditor,
  WixSetupPlanView,
} from "../artifacts/WixSetupArtifact";
import {SiteBuildArtifact} from "../artifacts/SiteBuildArtifact";
import {SiteReleaseView} from "../artifacts/SiteReleaseArtifact";
import {WebsiteContentView} from "../artifacts/WebsiteContentArtifact";
import {ManualTasksView} from "../artifacts/ManualTasksArtifact";

type ArtifactContentProps = {
  artifact: Artifact;
  versions: Artifact[];
  subject?: Artifact;
  taskId?: string;
  /** The full project detail, for Views that resolve sibling artifacts by id. */
  detail?: ProjectDetail;
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

/*
Editor is for an artifact that is editable or has any user input, and it's result is another artifact
currently only used for questions task generating answers artifact

View is for any other artifact view, like specification, design, etc.
 */
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
    View: ({ artifact, taskId }) => (
      <DesignArtifact
        artifact={artifact as Artifact<"design">}
        taskId={taskId as Id<"userTasks"> | undefined}
      />
    ),
  },
  wixSetupPlan: {
    View: ({ artifact }) => <WixSetupPlanView artifact={artifact as Artifact<"wixSetupPlan">} />,
    Editor: ({ artifact, previousResult, ...actions }) => (
      <WixSetupPlanEditor
        artifact={artifact as Artifact<"wixSetupPlan">}
        previousResult={previousResult as Artifact<"wixSetupDecision"> | undefined}
        {...actions}
      />
    ),
  },
  wixSetupDecision: {
    View: ({ artifact }) => (
      <WixSetupDecisionView artifact={artifact as Artifact<"wixSetupDecision">} />
    ),
  },
  wixProject: {
    View: ({ artifact }) => <WixProjectView artifact={artifact as Artifact<"wixProject">} />,
  },
  siteBuild: {
    View: ({ artifact, taskId, detail }) => (
      <SiteBuildArtifact
        artifact={artifact as Artifact<"siteBuild">}
        taskId={taskId as Id<"userTasks"> | undefined}
        detail={detail}
      />
    ),
  },
  siteRelease: {
    View: ({ artifact, detail }) => (
      <SiteReleaseView artifact={artifact as Artifact<"siteRelease">} />
    ),
  },
  websiteContent: {
    View: ({ artifact }) => <WebsiteContentView artifact={artifact as Artifact<"websiteContent">} />,
  },
  manualTasks: {
    View: ({ artifact }) => <ManualTasksView artifact={artifact as Artifact<"manualTasks">} />,
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
