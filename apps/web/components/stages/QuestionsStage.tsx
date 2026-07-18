import type {StageViewProps} from "./StageUI";
import {Question} from "@factory/shared";
import {KeyboardEvent, useCallback, useEffect, useState} from "react";
import {Briefcase, Check, CircleX, FileText, LayoutGrid, Lock, RefreshCw, Workflow} from "lucide-react";
import {useStageGate} from "@/data/useStageGate";
import {StageActions} from "./StageActions";

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

export function QuestionsStage({detail}: StageViewProps) {
  const {submit, regenerate, busy} = useStageGate(detail.project._id);
  const questions = detail.artifacts.questions[0]?.data;
  const sortedQuestions = [...(questions ?? [])].sort((a, b) => a.id - b.id);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const setAnswer = useCallback((id: number, answer: string) => setAnswers(a => ({...a, [id]: answer})), []);

  const allAnswered = sortedQuestions.every(q => (answers[q.id] ?? '').trim().length > 0);

  function handleSubmit() {
    // Fold the collected answers back into the question set and hand the whole
    // artifact to the gate — that's this stage's "stage data".
    const answered = sortedQuestions.map(q => ({...q, answer: answers[q.id] ?? q.answer ?? null}));
    void submit(answered);
  }

  return <div>
    <div className="flex flex-col gap-4">
      {sortedQuestions.map(question =>
        <QuestionCard key={question.id} question={question} setAnswer={setAnswer} />)}
    </div>
    <StageActions
      hint={!allAnswered ? "Answer every question to continue" : undefined}
      primary={{
        label: "Continue",
        onClick: handleSubmit,
        loading: busy === "submit",
        disabled: busy !== null || !allAnswered
      }}
      secondary={{
        label: "Regenerate questions",
        onClick: () => void regenerate(),
        loading: busy === "regenerate",
        disabled: busy !== null,
        icon: <RefreshCw size={16} />
      }}
    />
  </div>
}

function QuestionCard({question, setAnswer}: {question: Question, setAnswer: (id: number, answer: string) => void}) {
  const setThisAnswer = useCallback((answer: string) => setAnswer(question.id, answer), [setAnswer, question.id]);
  const Icon = CATEGORY_ICON[question.category] ?? FileText;

  return <div className="rounded border border-outline bg-white p-4">
    <div className="mb-1 flex items-start justify-between gap-3">
      <h3 className="text-sm font-semibold text-ink">{question.prompt}</h3>
      <Icon size={18} className="mt-0.5 shrink-0 text-outline" />
    </div>
    {question.rationale && <p className="mb-3 text-xs text-ink-muted">{question.rationale}</p>}

    {question.isList
      ? question.allowFreeText
        ? <ChipsSelect initial={question.options} setAnswer={setThisAnswer} />
        : <MultiSelect options={question.options ?? []} setAnswer={setThisAnswer} />
      : <SingleSelect options={question.options} allowFreeText={question.allowFreeText} setAnswer={setThisAnswer} />}
  </div>
}

const OTHER = Symbol('other');

/**
 * One choice from a set of options. Free text is an explicit "Other…" choice, not
 * an always-present box: the answer is unambiguous because the text field only
 * appears — and only counts — when "Other…" is picked. A question with no options
 * (pure open answer) shows the field directly.
 */
function SingleSelect({options, allowFreeText, setAnswer}: {
  options: string[] | null,
  allowFreeText: boolean,
  setAnswer: (answer: string) => void
}) {
  const hasOptions = !!options?.length;
  const [choice, setChoice] = useState<string | typeof OTHER | null>(hasOptions ? null : OTHER);
  const [text, setText] = useState('');
  const isOther = choice === OTHER;

  useEffect(() => {
    setAnswer(isOther ? text : (typeof choice === 'string' ? choice : ''));
  }, [choice, text, isOther, setAnswer]);

  return <div className="flex flex-col gap-3">
    {hasOptions && <div className="flex flex-wrap gap-2">
      {options!.map(option =>
        <button key={option} type="button" onClick={() => setChoice(option)}
                className={`${OPTION_BASE} min-w-35 flex-1 ${choice === option ? OPTION_ON : OPTION_OFF}`}>
          {option}
        </button>)}
      {allowFreeText &&
        <button type="button" onClick={() => setChoice(OTHER)}
                className={`${OPTION_BASE} ${isOther ? OPTION_ON : OPTION_OFF}`}>
          Other…
        </button>}
    </div>}
    {isOther && <input type="text" autoComplete="off" value={text} autoFocus={hasOptions}
                       onChange={e => setText(e.target.value)} placeholder="Type your answer…"
                       className={FIELD_CLASS} />}
  </div>
}

/** Pick any number of options (toggle pills). */
function MultiSelect({options, setAnswer}: {options: string[], setAnswer: (answer: string) => void}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setAnswer(selected.join(', '));
  }, [selected, setAnswer]);

  function toggle(option: string) {
    setSelected(sel => sel.includes(option) ? sel.filter(s => s !== option) : [...sel, option]);
  }

  return <div className="flex flex-wrap gap-2">
    {options.map(option => {
      const on = selected.includes(option);
      return <button key={option} type="button" onClick={() => toggle(option)}
                     className={`${OPTION_BASE} flex items-center gap-1 ${on ? OPTION_ON : OPTION_OFF}`}>
        {on && <Check size={14} />}
        {option}
      </button>;
    })}
  </div>
}

/** Build a free-form list of items as removable chips. */
function ChipsSelect({initial, setAnswer}: {initial: string[] | null, setAnswer: (answer: string) => void}) {
  const [items, setItems] = useState<string[]>(initial ?? []);
  const [input, setInput] = useState('');

  useEffect(() => {
    setAnswer(items.join(', '));
  }, [items, setAnswer]);

  function removeItem(item: string) {
    setItems(current => current.filter(c => c !== item));
  }

  function addItem(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const value = input.trim();
      if (value && !items.includes(value)) {
        setItems(current => [...current, value]);
      }
      setInput('');
    } else if (event.key === 'Backspace' && !input.length) {
      event.preventDefault();
      setItems(current => current.slice(0, -1));
    }
  }

  return <div className="flex flex-wrap items-center gap-2 rounded border border-outline bg-canvas px-3 py-2">
    {items.map(item =>
      <span key={item} className="flex items-center gap-1 rounded-full border border-primary bg-[#d8e2ff] py-0.5 pr-1 pl-2 text-xs text-[#004395]">
        {item}
        <CircleX onClick={() => removeItem(item)} className="cursor-pointer hover:opacity-70" size={14} />
      </span>)}
    <input type="text" value={input} placeholder={items.length ? "Add another…" : "Add item and press Enter…"}
           className="grow border-none bg-transparent p-0 text-sm text-ink outline-none placeholder:text-ink-muted"
           onInput={e => setInput((e.target as HTMLInputElement).value)} onKeyDown={addItem} />
  </div>
}
