"use client";

import type { Specification } from "@factory/shared";

const inputClass =
  "w-full rounded border border-outline bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-[#d8e2ff]";

/** Inline editing of the site plan. Saving always creates a NEW version (append-only). */
export function SpecificationEditor({
  onChange,
  spec,
}: {
  onChange: (spec: Specification) => void;
  spec: Specification;
}) {
  function updatePage(index: number, patch: Partial<Specification["pages"][number]>) {
    onChange({
      ...spec,
      pages: spec.pages.map((page, pageIndex) =>
        pageIndex === index ? { ...page, ...patch } : page,
      ),
    });
  }
  return (
    <section className="border-primary space-y-4 rounded border bg-[#edf5ff] p-5">
      <div>
        <label className="text-[10px] font-bold tracking-[0.1em] text-[#596170] uppercase">
          Site summary
        </label>
        <textarea
          className={`${inputClass} mt-2 min-h-24 resize-y`}
          onChange={(event) => onChange({ ...spec, summary: event.target.value })}
          value={spec.summary}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {spec.pages.map((page, pageIndex) => (
          <article
            className="border-outline space-y-3 rounded border bg-white p-4"
            key={`${page.path}-${pageIndex}`}
          >
            <div>
              <label className="text-[10px] font-bold tracking-[0.1em] text-[#596170] uppercase">
                Page name
              </label>
              <input
                className={`${inputClass} mt-1`}
                onChange={(event) => updatePage(pageIndex, { title: event.target.value })}
                value={page.title}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-[0.1em] text-[#596170] uppercase">
                Purpose
              </label>
              <textarea
                className={`${inputClass} mt-1 min-h-20 resize-y`}
                onChange={(event) => updatePage(pageIndex, { description: event.target.value })}
                value={page.description}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-[0.1em] text-[#596170] uppercase">
                Sections
              </label>
              <div className="mt-1 space-y-2">
                {page.sections.map((section, sectionIndex) => (
                  <input
                    className={inputClass}
                    key={`${section.type}-${sectionIndex}`}
                    onChange={(event) =>
                      updatePage(pageIndex, {
                        sections: page.sections.map((item, itemIndex) =>
                          itemIndex === sectionIndex
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      })
                    }
                    value={section.description}
                  />
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="text-[11px] text-[#596170]">
        Saving creates a new version. Earlier versions remain available above.
      </p>
    </section>
  );
}
