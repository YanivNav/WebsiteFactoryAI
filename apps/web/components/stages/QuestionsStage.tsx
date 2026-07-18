import type { StageViewProps } from "./StageUI";
import { Question } from "@factory/shared";
import { KeyboardEvent, useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  Check,
  CircleX,
  FileText,
  LayoutGrid,
  Lock,
  RefreshCw,
  Workflow,
} from "lucide-react";
import { useStageGate } from "@/data/useStageGate";
import { StageActions } from "./StageActions";
import { ArtifactVersionPicker } from "@/components/ArtifactVersionPicker";
import type { Id } from "@convex/_generated/dataModel";

// Option pills — mirrors the "Quick Questions" design: a light-blue filled,
// primary-bordered chip when picked; a subtle outlined chip otherwise.
const OPTION_BASE = "rounded border px-4 py-2 text-sm text-center transition-colors cursor-pointer";
const OPTION_ON = "border-primary bg-[#d8e2ff] text-[#004395] font-medium";
const OPTION_OFF = "border-outline bg-canvas text-ink hover:bg-[#eceef2]";

const FIELD_CLASS =
  "block w-full rounded border border-outline bg-canvas px-3 py-2 text-sm text-ink outline-none " +
  "placeholder:text-ink-muted focus:border-primary focus:ring-1 focus:ring-primary";

const CATEGORY_ICON = {
  content: FileText,
  workflows: Workflow,
  business: Briefcase,
  ui: LayoutGrid,
  auth: Lock,
} as const;

export function QuestionsStage({ detail }: StageViewProps) {
  const { submit, regenerate, busy } = useStageGate(detail.project._id);
  const versions = detail.artifacts.questions ?? [];
  const selectedArtifactId = detail.selectedArtifactIds.questions;
  const selectedArtifact =
    versions.find((artifact) => artifact.id === selectedArtifactId) ?? versions[0];
  const questions = selectedArtifact?.data;
  const sortedQuestions = [...(questions ?? [])].sort((a, b) => a.id - b.id);
  const versionKey = selectedArtifact?.id ?? "none";
  const [answersByVersion, setAnswersByVersion] = useState<Record<string, Record<number, string>>>(
    {},
  );
  const answers = answersByVersion[versionKey] ?? {};
  const setAnswer = useCallback(
    (id: number, answer: string) =>
      setAnswersByVersion((current) => ({
        ...current,
        [versionKey]: { ...current[versionKey], [id]: answer },
      })),
    [versionKey],
  );

  const allAnswered = sortedQuestions.every((q) => (answers[q.id] ?? "").trim().length > 0);

  function handleSubmit() {
    // Fold the collected answers back into the question set and hand the whole
    // artifact to the gate — that's this stage's "stage data".
    const answered = sortedQuestions.map((q) => ({
      ...q,
      answer: answers[q.id] ?? q.answer ?? null,
    }));
    void submit(answered, selectedArtifact?.id as Id<"artifacts"> | undefined);
  }

  return (
    <div>
      <section className="border-outline mb-4 rounded border bg-white p-4">
        <ArtifactVersionPicker
          label="Question versions"
          projectId={detail.project._id}
          selectedArtifactId={selectedArtifact?.id}
          versions={versions}
        />
      </section>
      <div className="flex flex-col gap-4">
        {sortedQuestions.map((question) => (
          <QuestionCard
            key={`${selectedArtifact?.id}-${question.id}`}
            question={question}
            setAnswer={setAnswer}
          />
        ))}
      </div>
      <StageActions
        hint={!allAnswered ? "Answer every question to continue" : undefined}
        primary={{
          label: "Continue",
          onClick: handleSubmit,
          loading: busy === "submit",
          disabled: busy !== null || !allAnswered,
        }}
        secondary={{
          label: "Regenerate questions",
          onClick: () =>
            void regenerate(undefined, selectedArtifact?.id as Id<"artifacts"> | undefined),
          loading: busy === "regenerate",
          disabled: busy !== null,
          icon: <RefreshCw size={16} />,
        }}
      />
    </div>
  );
}

function QuestionCard({
  question,
  setAnswer,
}: {
  question: Question;
  setAnswer: (id: number, answer: string) => void;
}) {
  const setThisAnswer = useCallback(
    (answer: string) => setAnswer(question.id, answer),
    [setAnswer, question.id],
  );
  const Icon = CATEGORY_ICON[question.category] ?? FileText;

  return (
    <div className="border-outline rounded border bg-white p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h3 className="text-ink text-sm font-semibold">{question.prompt}</h3>
        <Icon size={18} className="text-outline mt-0.5 shrink-0" />
      </div>
      {question.rationale && <p className="text-ink-muted mb-3 text-xs">{question.rationale}</p>}

      {question.isList ? (
        question.allowFreeText ? (
          <ChipsSelect
            initial={question.options}
            initialAnswer={question.answer ?? ""}
            setAnswer={setThisAnswer}
          />
        ) : (
          <MultiSelect
            options={question.options ?? []}
            initialAnswer={question.answer ?? ""}
            setAnswer={setThisAnswer}
          />
        )
      ) : (
        <SingleSelect
          options={question.options}
          allowFreeText={question.allowFreeText}
          initialAnswer={question.answer ?? ""}
          setAnswer={setThisAnswer}
        />
      )}
    </div>
  );
}

const OTHER = Symbol("other");

/**
 * One choice from a set of options. Free text is an explicit "Other…" choice, not
 * an always-present box: the answer is unambiguous because the text field only
 * appears — and only counts — when "Other…" is picked. A question with no options
 * (pure open answer) shows the field directly.
 */
function SingleSelect({
  options,
  allowFreeText,
  initialAnswer,
  setAnswer,
}: {
  options: string[] | null;
  allowFreeText: boolean;
  initialAnswer: string;
  setAnswer: (answer: string) => void;
}) {
  const hasOptions = !!options?.length;
  const preselected = !!initialAnswer && !!options?.includes(initialAnswer);
  const [choice, setChoice] = useState<string | typeof OTHER | null>(
    preselected ? initialAnswer : initialAnswer || !hasOptions ? OTHER : null,
  );
  const [text, setText] = useState(preselected ? "" : initialAnswer);
  const isOther = choice === OTHER;

  useEffect(() => {
    setAnswer(isOther ? text : typeof choice === "string" ? choice : "");
  }, [choice, text, isOther, setAnswer]);

  return (
    <div className="flex flex-col gap-3">
      {hasOptions && (
        <div className="flex flex-wrap gap-2">
          {options!.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setChoice(option)}
              className={`${OPTION_BASE} min-w-35 flex-1 ${choice === option ? OPTION_ON : OPTION_OFF}`}
            >
              {option}
            </button>
          ))}
          {allowFreeText && (
            <button
              type="button"
              onClick={() => setChoice(OTHER)}
              className={`${OPTION_BASE} ${isOther ? OPTION_ON : OPTION_OFF}`}
            >
              Other…
            </button>
          )}
        </div>
      )}
      {isOther && (
        <input
          type="text"
          autoComplete="off"
          value={text}
          autoFocus={hasOptions}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your answer…"
          className={FIELD_CLASS}
        />
      )}
    </div>
  );
}

/** Pick any number of options (toggle pills). */
function MultiSelect({
  options,
  initialAnswer,
  setAnswer,
}: {
  options: string[];
  initialAnswer: string;
  setAnswer: (answer: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    initialAnswer ? initialAnswer.split(", ").filter((v) => options.includes(v)) : [],
  );

  useEffect(() => {
    setAnswer(selected.join(", "));
  }, [selected, setAnswer]);

  function toggle(option: string) {
    setSelected((sel) =>
      sel.includes(option) ? sel.filter((s) => s !== option) : [...sel, option],
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`${OPTION_BASE} flex items-center gap-1 ${on ? OPTION_ON : OPTION_OFF}`}
          >
            {on && <Check size={14} />}
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** Build a free-form list of items as removable chips. */
function ChipsSelect({
  initial,
  initialAnswer,
  setAnswer,
}: {
  initial: string[] | null;
  initialAnswer: string;
  setAnswer: (answer: string) => void;
}) {
  const [items, setItems] = useState<string[]>(() =>
    initialAnswer ? initialAnswer.split(", ").filter(Boolean) : (initial ?? []),
  );
  const [input, setInput] = useState("");

  useEffect(() => {
    setAnswer(items.join(", "));
  }, [items, setAnswer]);

  function removeItem(item: string) {
    setItems((current) => current.filter((c) => c !== item));
  }

  function addItem(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const value = input.trim();
      if (value && !items.includes(value)) {
        setItems((current) => [...current, value]);
      }
      setInput("");
    } else if (event.key === "Backspace" && !input.length) {
      event.preventDefault();
      setItems((current) => current.slice(0, -1));
    }
  }

  return (
    <div className="border-outline bg-canvas flex flex-wrap items-center gap-2 rounded border px-3 py-2">
      {items.map((item) => (
        <span
          key={item}
          className="border-primary flex items-center gap-1 rounded-full border bg-[#d8e2ff] py-0.5 pr-1 pl-2 text-xs text-[#004395]"
        >
          {item}
          <CircleX
            onClick={() => removeItem(item)}
            className="cursor-pointer hover:opacity-70"
            size={14}
          />
        </span>
      ))}
      <input
        type="text"
        value={input}
        placeholder={items.length ? "Add another…" : "Add item and press Enter…"}
        className="text-ink placeholder:text-ink-muted grow border-none bg-transparent p-0 text-sm outline-none"
        onInput={(e) => setInput((e.target as HTMLInputElement).value)}
        onKeyDown={addItem}
      />
    </div>
  );
}
