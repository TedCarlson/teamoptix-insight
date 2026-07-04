import { foyerStories, type FoyerStory } from "@/features/foyer/stories/story-registry";
import type { FoyerConversationState } from "@/features/foyer/models/conversation";

export function routeFoyerExperience(state: FoyerConversationState): FoyerStory[] {
  const transcript = state.entries
    .flatMap((entry) => Array.isArray(entry.answer) ? entry.answer : [entry.answer])
    .join(" ")
    .toLowerCase();

  return foyerStories.filter((story) =>
    story.concernKeys.some((key) => transcript.includes(key.toLowerCase()))
  );
}
