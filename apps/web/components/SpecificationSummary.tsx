"use client";

import { CalendarDays, Database, FileText, ShoppingCart } from "lucide-react";
import type { Specification } from "@factory/shared";

const SOLUTION_LABELS: Record<string, string> = {
  stores: "Online Store",
  bookings: "Bookings",
  events: "Events",
  blog: "Blog",
  members: "Member Accounts",
  forms: "Forms",
  pricingPlans: "Paid Plans",
};

const SOLUTION_ICONS: Record<string, typeof ShoppingCart> = {
  stores: ShoppingCart,
  bookings: CalendarDays,
  blog: FileText,
};

export function SpecificationSummary({ spec }: { spec: Specification }) {
  return (
    <div className="space-y-5">
      <section className="border-outline rounded border bg-white p-5 shadow-sm md:p-6">
        <p className="max-w-3xl text-sm leading-6 text-[#424754]">{spec.summary}</p>
        {spec.infrastructure.wixBusinessSolutions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {spec.infrastructure.wixBusinessSolutions.map((solution) => {
              const Icon = SOLUTION_ICONS[solution] ?? FileText;
              return (
                <span
                  className="inline-flex items-center gap-2 rounded border border-[#bdc7d9] bg-[#d9e3f6] px-3 py-1.5 text-xs font-semibold text-[#3d4756]"
                  key={solution}
                >
                  <Icon size={14} />
                  {SOLUTION_LABELS[solution] ?? solution}
                </span>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {spec.pages.map((page) => (
          <article
            className="border-outline overflow-hidden rounded border bg-white"
            key={page.path}
          >
            <header className="border-outline flex items-center justify-between border-b bg-[#f1f2f4] px-4 py-3">
              <h3 className="text-sm font-semibold">{page.title}</h3>
              <code className="text-[11px] text-[#858c98]">{page.path}</code>
            </header>
            <div className="p-4">
              <p className="border-primary border-l-2 pl-3 text-xs leading-5 text-[#424754]">
                {page.description}
              </p>
              <h4 className="mt-4 mb-2 text-[10px] font-bold tracking-[0.1em] text-[#596170] uppercase">
                Page sections
              </h4>
              <ul className="space-y-1.5">
                {page.sections.map((section, index) => (
                  <li
                    className="flex gap-2 text-xs leading-4 text-[#313743]"
                    key={`${section.type}-${index}`}
                  >
                    <span className="bg-primary mt-1.5 size-1 shrink-0 rounded-full" />
                    <span>{section.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>

      {spec.infrastructure.cmsCollections.length > 0 && (
        <section className="border-outline rounded border bg-white p-5">
          <h3 className="flex items-center gap-2 text-xs font-bold tracking-[0.1em] text-[#424754] uppercase">
            <Database size={16} className="text-primary" />
            CMS collections
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {spec.infrastructure.cmsCollections.map((collection) => (
              <div
                className="rounded border border-[#e1e3e4] bg-[#f8f9fa] p-3"
                key={collection.name}
              >
                <p className="text-xs font-semibold">{collection.name}</p>
                <p className="mt-1 text-xs leading-4 text-[#596170]">{collection.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
