import {CircleX, LoaderCircle} from "lucide-react";
import type {StageViewProps} from "./StageUI";

export function SimpleProgressStage({detail}: StageViewProps) {
  return <section className="border-outline rounded border bg-white p-5">
    <div className="flex items-center gap-3">
      {detail.project.status === 'failed' ? <CircleX size={24} color="red" /> :
      <LoaderCircle className="text-primary animate-spin" size={24} />}
      <div>
        <h2 className="text-lg font-semibold">{detail.statusMessage}</h2>
      </div>
      <div>
        <div className="mt-3 h-1.5 rounded-full bg-[#e1e3e6]">
          <div className="bg-primary h-full rounded-full transition-[width] duration-500"
               style={{width: `${Math.round(detail.project.progress?.step ?? 0) / (detail.project.progress?.total ?? 1)}%`}} />
        </div>
      </div>
    </div>
  </section>
}