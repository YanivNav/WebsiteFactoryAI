import type { Specification, SpecPage } from "@factory/shared";
import type { WorkContext } from "../operations/context";

export interface GeneratedScreen {
  name: string;
  html: string;
  image: string;
}

export class StitchService {
  generateScreen(
    ctx: WorkContext,
    brief: string,
    specification: Specification,
    page: SpecPage,
  ): GeneratedScreen {
    void ctx.progress(0, `Designing screen: ${page.name}`);
    return { name: "", html: "", image: "" };
  }
}
