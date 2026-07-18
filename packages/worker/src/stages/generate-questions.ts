import type {StageHandler} from "./types";
import {LLMService} from "../services/llm";
import {loadPrompt} from "../lib/prompts";
import {z} from "zod";
import {QuestionSchema} from "@factory/shared";

let llm: LLMService;

export const generateQuestions: StageHandler = {
  stage: 'GeneratingQuestions',
  async run(ctx) {
    ctx.progress(0, 'Reviewing your brief');
    const [latestQuestions, brief] = await Promise.all([
      ctx.getLatestArtifact('questions'),
      ctx.getLatestArtifact('brief'),
    ]);

    llm ??= new LLMService();

    ctx.progress(10, 'Generating clarifying questions');

    const result = await llm.generateObject({
      instructions: loadPrompt('questions'),
      prompt: `Website Brief:\n${brief?.data ?? 'No brief provided.'}\n
      Questions already asked and their answers: \n${
        latestQuestions ? latestQuestions.data
          .map(question => `${question.id}. ${question.prompt}: ${question.answer || 'no answer'}`).join('\n')
      : 'No questions asked.'}`,
      schema: z.array(QuestionSchema).max(10)
    });

    ctx.progress(85, 'Preparing your questions');
    if (result.length) {
      if (latestQuestions) {
        await ctx.updateArtifact<'questions'>(latestQuestions.id, [...latestQuestions.data, ...result]);
      } else {
        await ctx.addArtifact('questions', result);
      }
    }
    ctx.log('info', result.length ? (result.length + ' questions ready') : 'Your brief has everything we need');
    return {kind: 'advance'};
  }
}