import { WixSetupPlanSchema } from "@factory/shared";
import { LLMService } from "../services/llm";
import { reviewCompletion, type WorkHandler } from "./types";

let llm: LLMService;

export const planWixSetup: WorkHandler<"planWixSetup"> = {
  operation: "planWixSetup",
  async run(ctx) {
    const specification = await ctx.getInput("specification");
    const previousPlan = await ctx.getRevisionBase("wixSetupPlan");
    llm ??= new LLMService();

    await ctx.progress(10, "Weighing Wix-managed against self-managed hosting");

    const plan = await llm.generateObject({
      instructions: "wix-setup",
      message: JSON.stringify(
        {
          specification: specification.data,
          previousPlan: previousPlan?.data,
          requestedChange: ctx.work.instruction.revision?.feedback,
        },
        null,
        2,
      ),
      schema: WixSetupPlanSchema,
    });

    await ctx.progress(85, "Preparing the recommendation");
    const artifact = await ctx.addArtifact("wixSetupPlan", "wixSetupPlan", plan, previousPlan?.id);

    return reviewCompletion("planWixSetup", artifact.id);
  },
};
