import type { FoyerQuestion } from "@/features/foyer/models/conversation";

export const openingQuestions: FoyerQuestion[] = [
  {
    id: "operation_intro",
    prompt: "Tell us about your operation.",
    mode: "text",
  },
  {
    id: "years_operating",
    prompt: "How long have you been doing this?",
    mode: "text",
  },
  {
    id: "route_count",
    prompt: "How many routes do you run?",
    mode: "text",
  },
  {
    id: "primary_pressure",
    prompt: "What keeps you up at night?",
    mode: "text",
  },
];
