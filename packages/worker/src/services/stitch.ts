import type {Specification, SpecPage} from "@factory/shared";
import type {StageContext} from "../stages/context";

export interface GeneratedScreen {
  name: string;
  html: string;
  image: string;
}

export class StitchService {
  generateScreen(ctx: StageContext, brief: string, specification: Specification, page: SpecPage): GeneratedScreen {
    ctx.progress(0, 'Designing screen: ' + page.name);
    return {name: '', html: '', image: ''}
  }
}