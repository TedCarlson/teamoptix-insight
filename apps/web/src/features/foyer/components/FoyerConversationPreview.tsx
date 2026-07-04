"use client";

import { useMemo, useState } from "react";
import {
  answerFoyerQuestion,
  createFoyerConversationState,
  getCurrentFoyerQuestion,
} from "@/features/foyer/engine/conversation-engine";
import { routeFoyerExperience } from "@/features/foyer/engine/experience-router";
import type { FoyerConversationState } from "@/features/foyer/models/conversation";

export default function FoyerConversationPreview() {
  const [state, setState] = useState<FoyerConversationState>(() =>
    createFoyerConversationState()
  );
  const [answer, setAnswer] = useState("");

  const currentQuestion = getCurrentFoyerQuestion(state);
  const stories = useMemo(() => routeFoyerExperience(state), [state]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const cleaned = answer.trim();
    if (!cleaned) return;

    setState((current) => answerFoyerQuestion(current, cleaned));
    setAnswer("");
  }

  return (
    <section className="foyer-conversation-preview">
      <div>
        <p className="foyer-kicker">Operator discovery</p>
        <h2>Tell us about your operation.</h2>
        <p>
          Before we show you Insight, we want to understand what part of the
          business carries the most weight for you.
        </p>
      </div>

      <div className="foyer-conversation-preview__panel">
        <div className="foyer-conversation-preview__thread">
          {state.entries.map((entry) => (
            <article key={`${entry.questionId}-${entry.answeredAt}`}>
              <p>{entry.prompt}</p>
              <strong>{Array.isArray(entry.answer) ? entry.answer.join(", ") : entry.answer}</strong>
            </article>
          ))}

          {currentQuestion ? (
            <article className="foyer-conversation-preview__active">
              <p>{currentQuestion.prompt}</p>
            </article>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="foyer-conversation-preview__form">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type naturally. Example: Payroll takes too much of my week."
            rows={4}
          />
          <button type="submit" className="button button-primary">
            Continue
          </button>
        </form>

        {stories.length > 0 ? (
          <div className="foyer-conversation-preview__stories">
            <p className="foyer-kicker">What we can show you</p>
            {stories.map((story) => (
              <article key={story.id}>
                <h3>{story.title}</h3>
                <p>{story.elevatorPitch}</p>
                <strong>{story.invitation}</strong>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
