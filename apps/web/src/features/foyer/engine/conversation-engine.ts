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

  return {
    currentQuestionId: nextQuestion?.id ?? currentQuestion.id,
    entries: [...state.entries, entry],
  };
}
