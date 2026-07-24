import type { SiteActionType } from "../server";
import type { SiteActionHandler } from "./site-action-context";
import { handleSiteChange } from "./site-change";
import { handlePreview } from "./site-preview";
import { handleStartDev, handleStopDev } from "./site-dev";
import { handlePublish } from "./site-publish";

const handlers: Record<SiteActionType, SiteActionHandler> = {
  changeRequest: handleSiteChange,
  cleanRebuild: handleSiteChange,
  revertToCommit: handleSiteChange,
  revertSiteTo: handleSiteChange,
  applyContent: handleSiteChange,
  screenChange: handleSiteChange,
  preview: handlePreview,
  startDev: handleStartDev,
  stopDev: handleStopDev,
  publish: handlePublish,
};

export function getSiteActionHandler(type: SiteActionType): SiteActionHandler {
  return handlers[type];
}
