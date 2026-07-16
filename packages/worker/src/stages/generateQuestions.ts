import { hashInputs } from "../lib/hash.js";
import { ClarifyingAnswerSet } from "@factory/shared";
import {
  LlmQuestionGenerator,
  type QuestionGenerator,
  type QuestionInput,
} from "../services/spec/questions.js";
import type { StageHandler } from "./types.js";

let generator: QuestionGenerator | undefined;

export const generateQuestions: StageHandler = {
  stage: "GeneratingQuestions",
  async run(ctx) {
    await ctx.progress(10, "Reviewing your brief");
    generator ??= new LlmQuestionGenerator();
    const [answerArtifact, previousQuestionArtifact] = await Promise.all([
      ctx.store.getLatestArtifact(ctx.projectId, "answers"),
      ctx.store.getLatestArtifact(ctx.projectId, "questions"),
    ]);
    const planningCycle = ctx.planningCycle ?? 1;
    const currentAnswers =
      answerArtifact && (answerArtifact.planningCycle ?? 1) === planningCycle
        ? answerArtifact
        : null;
    const currentQuestions =
      previousQuestionArtifact && (previousQuestionArtifact.planningCycle ?? 1) === planningCycle
        ? previousQuestionArtifact
        : null;
    const answers = currentAnswers ? ClarifyingAnswerSet.parse(currentAnswers.data).answers : [];
    const previousData = currentQuestions?.data as
      { round?: number; questions?: Array<{ id?: string; prompt?: string }> } | undefined;
    const latestQuestions = (previousData?.questions ?? []).flatMap((question) =>
      question.id && question.prompt ? [{ id: question.id, prompt: question.prompt }] : [],
    );
    const previousQuestions = [
      ...latestQuestions,
      ...answers
        .filter((answer) => !latestQuestions.some((question) => question.id === answer.questionId))
        .map((answer) => ({
          id: answer.questionId,
          prompt: "Already answered in an earlier round",
        })),
    ];
    const inputs: QuestionInput = {
      brief: ctx.brief,
      answers,
      previousQuestions,
      round: (previousData?.round ?? (currentQuestions ? 1 : 0)) + 1,
    };
    await ctx.progress(35, "Working out what still needs clarification");
    const { questions, promptHash } = await generator.generate(inputs);
    await ctx.progress(85, "Preparing your questions");
    await ctx.emitArtifact("questions", questions, { promptHash, inputsHash: hashInputs(inputs) });
    await ctx.log(
      questions.questions.length === 0
        ? "Your brief has everything we need"
        : `${questions.questions.length} planning questions ready`,
    );
    return { kind: "questions", hasQuestions: questions.questions.length > 0 };
  },
};
