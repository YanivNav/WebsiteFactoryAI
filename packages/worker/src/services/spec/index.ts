/**
 * Specification generation.
 *
 *   interface SpecGenerator { generate(input): Promise<SpecResult> }
 *
 * Input:  a brief (plus, once Phase 3b lands, the answers to the clarifying questions).
 * Output: a structured, schema-constrained specification.
 *
 * The stage handler must never know which model is behind this. Swapping the model is
 * an env var (see services/llm); swapping the whole approach is a new class
 * implementing this interface. Neither touches the stage.
 */

import { generateText, Output } from "ai";
import {
  ProjectSpecification,
  type AnswerSet,
  type CapabilitySnapshot,
  type Requirements,
  type SolutionArchitecture,
  type Specification,
} from "@factory/shared";
import { loadPrompt } from "../../lib/prompts.js";
import { resolveModel } from "../llm";

/**
 * Everything the specification depends on, in one object.
 *
 * This type IS the determinism contract. If a value influences the output, it belongs
 * here — where it gets hashed into `inputsHash`. Anything the generator reads that is
 * NOT in here (a global, a behaviour-changing env var, "what the last prompt said") is
 * hidden state, and it silently breaks the guarantee that rerunning this stage tomorrow
 * with the same inputs behaves the same way.
 */
export interface SpecInput {
  brief: string;
  answers: AnswerSet["answers"];
  designFeedback: string[];
  specificationFeedback: string[];
  previousSpecification?: Specification;
  businessRequirements: Requirements;
  wixCapabilities: CapabilitySnapshot;
  wixArchitecture: SolutionArchitecture;
}

export interface SpecResult {
  specification: Specification;
  /** sha256 of the prompt file used. The service owns the prompt, so it owns this. */
  promptHash: string;
}

export interface SpecGenerator {
  generate(input: SpecInput): Promise<SpecResult>;
}

export class LlmSpecGenerator implements SpecGenerator {
  async generate(input: SpecInput): Promise<SpecResult> {
    // The prompt is a FILE, and its hash goes onto the artifact. Nothing we tell the
    // model may be inlined here — anything inlined escapes the hash, and then two runs
    // that record identical provenance could have been given different instructions.
    const prompt = loadPrompt("spec");

    // `Output.object` hands the schema to the model and returns parsed, validated,
    // typed output. If the model cannot satisfy the schema, `generateText` throws;
    // the existing stage failure path releases the lease for a safe retry.
    const { output } = await generateText({
      model: resolveModel(),
      output: Output.object({ schema: ProjectSpecification }),
      instructions: prompt.text, // `system` is deprecated in AI SDK v7
      prompt: [
        `Client brief:\n${input.brief}`,
        input.answers.length > 0
          ? `Clarifying answers:\n${input.answers.map((answer) => `- ${answer.questionId}: ${answer.value}`).join("\n")}`
          : "Clarifying answers: none required.",
        input.previousSpecification
          ? `Current approved site plan:\n${JSON.stringify(input.previousSpecification, null, 2)}`
          : "Current approved site plan: none.",
        `Business requirements (implementation-neutral):\n${JSON.stringify(input.businessRequirements, null, 2)}`,
        `Current Wix capability evidence:\n${JSON.stringify(input.wixCapabilities, null, 2)}`,
        `Wix solution architecture:\n${JSON.stringify(input.wixArchitecture, null, 2)}`,
        input.designFeedback.length > 0
          ? `Feedback from visual design review:\n${input.designFeedback.map((item) => `- ${item}`).join("\n")}\nUpdate the site structure only where the feedback requires it. Add or remove pages and sections when necessary; preserve unrelated decisions.`
          : "Feedback from visual design review: none.",
        input.specificationFeedback.length > 0
          ? `Feedback from site plan review:\n${input.specificationFeedback.map((item) => `- ${item}`).join("\n")}\nApply this feedback while preserving unrelated approved decisions.`
          : "Feedback from site plan review: none.",
      ].join("\n\n"),
    });

    return { specification: output, promptHash: prompt.hash };
  }
}
