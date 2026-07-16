"use client";

import { useState } from "react";
import { Check, Info, LoaderCircle, Sparkles } from "lucide-react";
import type { QuestionSet } from "@factory/shared";

/** The WaitingForAnswers gate: clarifying questions that fill gaps in the brief. */
export function QuickQuestions({
  onSubmit,
  projectTitle,
  questions,
}: {
  onSubmit: (answers: Array<{ questionId: string; value: string }>) => Promise<unknown>;
  projectTitle: string;
  questions: QuestionSet;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const complete = questions.questions.every((question) => Boolean(answers[question.id]?.trim()));

  function applyCustomAnswer(questionId: string) {
    const value = custom[questionId]?.trim();
    if (!value) return;
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  async function submit() {
    if (!complete) return;
    setSubmitting(true);
    try {
      await onSubmit(
        questions.questions.map((question) => ({
          questionId: question.id,
          value: answers[question.id]!,
        })),
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <div className="border-outline border-b pb-5">
        <span className="rounded bg-[#e7e8e9] px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-[#596170] uppercase">
          Project planning
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Plan the right website</h1>
        <p className="mt-1 text-sm text-[#596170]">
          {questions.contextSummary ||
            `Tell us how ${projectTitle} should work so its Wix setup fits the real business.`}
        </p>
        {questions.round && (
          <p className="mt-2 text-[10px] font-bold tracking-[0.1em] text-[#697181] uppercase">
            Planning round {questions.round} · {questions.phase}
          </p>
        )}
      </div>
      <div className="mt-6 space-y-4">
        {questions.questions.map((question, index) => (
          <section className="border-outline rounded border bg-white p-4" key={question.id}>
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                {question.category && (
                  <p className="text-primary mb-1 text-[10px] font-bold tracking-[0.08em] uppercase">
                    {question.category}
                  </p>
                )}
                <h2 className="text-sm font-semibold">{question.prompt}</h2>
              </div>
              <span className="text-[10px] font-semibold text-[#858c98]">
                {index + 1} / {questions.questions.length}
              </span>
            </div>
            {question.rationale && (
              <p className="mb-3 flex items-start gap-1.5 text-[11px] leading-4 text-[#697181]">
                <Info className="mt-0.5 shrink-0" size={12} />
                {question.rationale}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => (
                <button
                  aria-pressed={answers[question.id] === option.label}
                  className={`min-h-11 rounded border px-3 text-xs font-semibold tracking-[0.03em] transition-colors ${answers[question.id] === option.label ? "border-primary bg-[#d8e2ff] text-[#004395]" : "border-outline bg-[#f8f9fa] hover:bg-[#f1f2f4]"}`}
                  key={option.id}
                  onClick={() =>
                    setAnswers((current) => ({ ...current, [question.id]: option.label }))
                  }
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            {question.allowCustom && (
              <div className="mt-3 flex gap-2">
                <input
                  className="border-outline focus:border-primary min-w-0 flex-1 rounded border px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#d8e2ff]"
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    applyCustomAnswer(question.id);
                  }}
                  onChange={(event) =>
                    setCustom((current) => ({ ...current, [question.id]: event.target.value }))
                  }
                  placeholder="Another answer…"
                  value={custom[question.id] ?? ""}
                />
                <button
                  className={`inline-flex min-w-28 cursor-pointer items-center justify-center gap-1.5 rounded border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:border-[#d7d9dd] disabled:bg-[#f1f2f4] disabled:text-[#969ca7] ${answers[question.id] === custom[question.id]?.trim() && Boolean(custom[question.id]?.trim()) ? "border-primary bg-[#d8e2ff] text-[#004395]" : "border-primary bg-white text-[#004395] hover:bg-[#edf3ff]"}`}
                  disabled={!custom[question.id]?.trim()}
                  onClick={() => applyCustomAnswer(question.id)}
                  type="button"
                >
                  {answers[question.id] === custom[question.id]?.trim() &&
                    Boolean(custom[question.id]?.trim()) && <Check size={13} />}
                  {answers[question.id] === custom[question.id]?.trim() &&
                  Boolean(custom[question.id]?.trim())
                    ? "Answer selected"
                    : "Use answer"}
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="border-outline mt-6 flex justify-end border-t pt-5">
        <button
          className="bg-primary inline-flex min-h-10 items-center gap-2 rounded px-6 text-xs font-semibold text-white hover:bg-[#064aa0] disabled:opacity-40"
          disabled={!complete || submitting}
          onClick={() => void submit()}
          type="button"
        >
          {submitting ? (
            <LoaderCircle className="animate-spin" size={15} />
          ) : (
            <Sparkles size={15} />
          )}
          {questions.round && questions.round > 1 ? "Continue planning" : "Review answers"}
        </button>
      </div>
    </div>
  );
}
