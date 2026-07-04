export type FoyerAnswerMode = "text" | "choice" | "multi_choice";

export type FoyerQuestion = {
  id: string;
  prompt: string;
  mode: FoyerAnswerMode;
  choices?: string[];
};

export type FoyerConversationEntry = {
  questionId: string;
  prompt: string;
  answer: string | string[];
  answeredAt: string;
};

export type FoyerConversationState = {
  currentQuestionId: string;
  entries: FoyerConversationEntry[];
};
