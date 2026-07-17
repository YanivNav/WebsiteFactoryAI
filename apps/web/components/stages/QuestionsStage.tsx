import type {StageViewProps} from "./StageUI";
import {Question} from "@factory/shared";
import {useState} from "react";


export function QuestionsStage({detail}: StageViewProps) {
  const questions = detail.artifacts.questions[0]?.data;
  const sortedQuestions = questions?.sort((a, b) => a.id - b.id);

  return <div>
    <div className="flex flex-col gap-4">
      {sortedQuestions.map(question => <QuestionCard key={question.id} question={question} />)}
    </div>
  </div>
}

function QuestionCard({question}: {question: Question}) {
  const [answer, setAnswer] = useState<string>('');
  return <div className="border-outline rounded border bg-white p-4">

  </div>
}