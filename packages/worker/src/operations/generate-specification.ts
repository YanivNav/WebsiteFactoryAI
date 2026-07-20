import { QuestionnaireSchema, SpecificationSchema } from "@factory/shared";
import { z } from "zod";
import { LLMService } from "../services/llm";
import type { WorkHandler } from "./types";

let llm: LLMService;

const SpecOutcomeSchema = z.union([
  z.object({ status: z.literal("ready"), specification: SpecificationSchema }),
  z.object({
    status: z.literal("needMoreInfo"),
    reason: z.string(),
  }),
]);

export const generateSpecification: WorkHandler<"generateSpecification"> = {
  operation: "generateSpecification",
  async run(ctx) {
    await ctx.progress(0, "Reviewing your answers");
    const [brief, questionnaire, response, previousSpecification] = await Promise.all([
      ctx.getInput("brief"),
      ctx.getInput("questionnaire"),
      ctx.getInput("questionnaireResponse"),
      ctx.getRevisionBase("specification"),
    ]);
    llm ??= new LLMService();
    await ctx.progress(15, "Defining the pages, content, and Wix features");

    const answerByQuestion = new Map(
      response.data.answers.map((answer) => [answer.questionId, answer.value]),
    );
    const qa = questionnaire.data.questions.length
      ? questionnaire.data.questions
          .map((question) => `${question.prompt}\n→ ${answerByQuestion.get(question.id) ?? ""}`)
          .join("\n\n")
      : "No questions were required.";
    const revision = previousSpecification
      ? `\n\nPrevious site plan:\n${JSON.stringify(previousSpecification.data, null, 2)}\n\n${
          ctx.work.instruction.revision?.feedback
            ? `Requested change:\n${ctx.work.instruction.revision.feedback}\nPreserve everything the request does not change.`
            : "Create an alternative without silently removing existing requirements."
        }`
      : "";

    const outcome = await llm.generateObject({
      instructions: "spec",
      message: `Website Brief:\n${brief.data}\n\nAnswers:\n${qa}${revision}`,
      schema: SpecOutcomeSchema,
    });

    if (outcome.status === "needMoreInfo") {
      await ctx.progress(60, `More details needed: ${outcome.reason}`);
      const questions = await llm.generateObject({
        instructions: "questions",
        message: `Ask only the missing questions needed because: ${outcome.reason}.\n\nBrief:\n${brief.data}\n\nPrevious answers:\n${qa}`,
        schema: QuestionnaireSchema,
      });
      const followUpQuestionnaire = await ctx.addArtifact(
        "followUpQuestionnaire",
        "questionnaire",
        {
          questions: [...questionnaire.data.questions, ...questions.questions],
        },
        questionnaire.id,
      );
      return {
        type: "createUserTask",
        task: {
          phase: ctx.work.phase,
          label: "A few more questions",
          subjectArtifactId: followUpQuestionnaire.id,
          previousResultArtifactId: response.id,
          result: { type: "submitArtifact", artifactType: "questionnaireResponse" },
        },
      };
    }

    const artifact = await ctx.addArtifact(
      "specification",
      "specification",
      outcome.specification,
      previousSpecification?.id,
    );
    await ctx.progress(90, "Finalizing your site plan");
    return {
      type: "createUserTask",
      task: {
        phase: ctx.work.phase,
        label: "Review your site plan",
        subjectArtifactId: artifact.id,
        result: { type: "selectVersion" },
      },
    };
  },
};
