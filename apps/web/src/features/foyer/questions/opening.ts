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
    prompt: "If we could improve two things over the next six months, what would you choose?",
    mode: "text",
  },
];
