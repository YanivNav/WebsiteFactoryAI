import type {StageViewProps} from "./StageUI";
import {Question} from "@factory/shared";
import {KeyboardEvent, useCallback, useEffect, useState} from "react";
import {useMutation} from "convex/react";
import {api} from "@convex/_generated/api";
import {CircleX, DeleteIcon} from "lucide-react";


export function QuestionsStage({detail}: StageViewProps) {
  const submitStage = useMutation(api.projects.continueFromGate);
  const questions = detail.artifacts.questions[0]?.data;
  const sortedQuestions = questions?.sort((a, b) => a.id - b.id);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const setAnswer = useCallback((id: number, answer: string) => setAnswers(a => ({...a, [id]: answer})), []);

  return <div>
    <div className="flex flex-col gap-4">
      {sortedQuestions.map(question =>
        <QuestionCard key={question.id} question={question} setAnswer={setAnswer} />)}
    </div>
  </div>
}

function QuestionCard({question, setAnswer}: {question: Question, setAnswer: (id: number, answer: string) => void}) {
  const setThisAnswer = useCallback((answer: string) => setAnswer(question.id, answer), [setAnswer, question.id]);
  return <div className="border-outline rounded border bg-white p-4">
    <h3>{question.prompt}</h3>
    <span className="text-sm text-gray-500">{question.rationale}</span>
    {!question.isList && question.options && <OptionList options={question.options} setAnswer={setThisAnswer} />}
    {question.isList && question.allowFreeText && <ChipsSelect initial={question.options} setAnswer={setThisAnswer} />}
    {question.isList && !question.allowFreeText && question.options && <CheckboxGroup options={question.options} setAnswer={setThisAnswer} />}
    {!question.isList && question.allowFreeText && <div>
        <input type="text" autoComplete="off" placeholder="Another answer..." onChange={e => setThisAnswer(e.target.value)}
               className="mt-2 block w-full rounded border border-outline px-2.5 py-2 font-normal tracking-normal text-ink outline-none placeholder:text-[#737d8e] focus:border-primary focus:ring-2 focus:ring-[#d9e7fb]" />
    </div>}
  </div>
}

function OptionList({options, setAnswer}: {options: string[], setAnswer: (answer: string) => void}) {
  const [selectedIndex, setSelected] = useState(-1);
  return <div className="flex m-3 flex-wrap gap-3">
    {options.map((option, index) =>
      <div key={option} className={`flex items-center justify-center h-8 border-outline bg-mist-200 border text-sm px-2 cursor-pointer
      rounded-lg hover:bg-mist-400 transition-[background-color] ${index === selectedIndex ? 'bg-cyan-200' : ''}`}
           onClick={() => {setSelected(index); setAnswer(option)}}>{option}</div>)}
  </div>
}

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
      if (!items.includes(input.trim())) {
        setItems(current => [...current, input.trim()]);
      }
      setInput('');
    } else if (event.key === 'Backspace' && !input.length) {
      event.preventDefault();
      setItems(current => current.slice(0, -1));
    }
  }

  return <div className="relative m-3">
    <div className="flex border-outline bg-gray-200 rounded-sm px-3 py-2 gap-2">
      {items.map((item) => <div key={item} className="rounded-full bg-white border-primary p-1 text-xs flex items-center gap-1">
        <CircleX onClick={() => removeItem(item)} className="hover:text-primary cursor-pointer" size={14} />
        {item}
      </div>)}
      <input type="text" className="border-none outline-none bg-transparent p-0 m-0 grow text-sm" value={input} placeholder="Add item and press Enter..."
             onInput={e => setInput((e.target as HTMLInputElement).value)} onKeyDown={addItem}/>
    </div>
  </div>
}

function CheckboxGroup({options, setAnswer}: {options: string[], setAnswer: (answer: string) => void}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setAnswer(selected.join(', '));
  }, [selected, setAnswer]);

  function toggle(option: string, checked: boolean) {
    if (checked) {
      setSelected(sel => [...sel, option]);
    } else {
      setSelected(sel => sel.filter(s => s !== option));
    }
  }

  return <div className="flex gap-2">
    {options.map((option) =>
    <label key={option}>
      <input type="checkbox" checked={selected.includes(option)} onChange={e => toggle(option, e.target.checked)} />
      {option}
    </label>
    )}
  </div>
}