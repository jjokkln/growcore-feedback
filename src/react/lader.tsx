"use client";

import { useEffect, useState, type ComponentProps, type ComponentType } from "react";

import { knopfAnmelden } from "./einstieg.ts";

/**
 * Lädt den eigentlichen Client-Teil erst im Browser nach (0.17.0).
 *
 * Warum nicht einfach ein statischer Import: Eine Server-Komponente, die eine
 * Client-Komponente importiert, hängt deren Code an JEDE Seite des Projekts —
 * auch wenn sie gar nichts rendert, weil `FEEDBACK` aus ist. Ein dynamischer
 * Import in der Server-Komponente ändert daran nichts (gemessen an
 * bejob-landing, Next 16, Turbopack: derselbe Chunk, 24 KB gz je Seite). Erst
 * ein `import()` AUS dem Browser-Code heraus ist ein eigener Chunk, den die
 * Seite nur holt, wenn dieser Lader gerendert wird — und der steht nur im
 * HTML, wenn `FEEDBACK=1`.
 *
 * Der Lader selbst ist winzig (React plus ein paar Zeilen aus `einstieg.ts`).
 */

type FeedbackProps = ComponentProps<typeof import("./feedback.tsx").GrowcoreFeedback>;
type KnopfProps = ComponentProps<typeof import("./knopf.tsx").AnmerkungsKnopf>;

function useNachgeladen<P>(laden: () => Promise<ComponentType<P>>): ComponentType<P> | null {
  const [komponente, setKomponente] = useState<ComponentType<P> | null>(null);
  useEffect(() => {
    let aktiv = true;
    laden()
      .then((c) => {
        if (aktiv) setKomponente(() => c);
      })
      .catch(() => {
        // Chunk nicht erreichbar (Offline, Deployment gewechselt): kein Werkzeug, keine Störung.
      });
    return () => {
      aktiv = false;
    };
    // `laden` ist je Aufrufer eine feste Funktion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return komponente;
}

/** Overlay und KI-Hilfe, nachgeladen. */
export function FeedbackLader(props: FeedbackProps) {
  const Feedback = useNachgeladen<FeedbackProps>(() => import("./feedback.tsx").then((m) => m.GrowcoreFeedback));
  return Feedback ? <Feedback {...props} /> : null;
}

/**
 * Der `?`-Knopf, nachgeladen. Meldet sich SOFORT als eingebunden an, noch bevor
 * sein Code da ist: Sonst zeigte das Overlay, das vielleicht früher fertig wird,
 * kurz den Stift unten links als Notnagel.
 */
export function KnopfLader(props: KnopfProps) {
  useEffect(() => knopfAnmelden(), []);
  const Knopf = useNachgeladen<KnopfProps>(() => import("./knopf.tsx").then((m) => m.AnmerkungsKnopf));
  return Knopf ? <Knopf {...props} /> : null;
}
