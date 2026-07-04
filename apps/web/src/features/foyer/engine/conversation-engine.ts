import { openingQuestions } from "@/features/foyer/questions/opening";
import type {
  FoyerConversationEntry,
  FoyerConversationState,
  FoyerQuestion,
} from "@/features/foyer/models/conversation";

export function createFoyerConversationState(): FoyerConversationState {
  return {
    currentQuestionId: openingQuestions[0]?.id ?? "",
    entries: [],
    response: {
      decision: "CONTINUE",
    },
  };
}

export function getCurrentFoyerQuestion(
  state: FoyerConversationState
): FoyerQuestion | null {
  return openingQuestions.find((question) => question.id === state.currentQuestionId) ?? null;
}

export function answerFoyerQuestion(
  state: FoyerConversationState,
  answer: string | string[]
): FoyerConversationState {
  const currentQuestion = getCurrentFoyerQuestion(state);

  if (!currentQuestion) return state;

  const entry: FoyerConversationEntry = {
    questionId: currentQuestion.id,
    prompt: currentQuestion.prompt,
    answer,
    answeredAt: new Date().toISOString(),
  };

  const currentIndex = openingQuestions.findIndex(
    (question) => question.id === currentQuestion.id
  );

  const nextQuestion = openingQuestions[currentIndex + 1] ?? null;
  const answerText = Array.isArray(answer) ? answer.join(", ") : answer;

  const acknowledgement =
    currentQuestion.id === "route_count"
      ? `${answerText} routes is a meaningful operation. At that size, consistency becomes just as important as growth.`
      : currentQuestion.id === "primary_pressure"
        ? "Thank you. Those priorities tell us where Insight can provide the most value."
        : "Thank you. That gives us a better understanding of your operation.";

  const decision =
    currentQuestion.id === "primary_pressure"
      ? "RECOMMEND_EXPERIENCES"
      : "CONTINUE";

  return {
    currentQuestionId: decision === "RECOMMEND_EXPERIENCES"
      ? ""
      : nextQuestion?.id ?? currentQuestion.id,
    entries: [...state.entries, entry],
    response: {
      acknowledgement,
      decision,
    },
  };
}
