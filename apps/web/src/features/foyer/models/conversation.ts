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

export type FoyerConversationDecision =
  | "CONTINUE"
  | "COLLECT_PRIORITIES"
  | "RECOMMEND_EXPERIENCES";

export type FoyerConversationResponse = {
  acknowledgement?: string;
  storyId?: string;
  decision: FoyerConversationDecision;
};

export type FoyerConversationState = {
  currentQuestionId: string;
  entries: FoyerConversationEntry[];
  response: FoyerConversationResponse;
};
