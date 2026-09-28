import type { ZielKatalog } from "../core/ziele.ts";
import { GrowcoreFeedback } from "../react/feedback.tsx";
import { AnmerkungsKnopf } from "../react/knopf.tsx";

/**
 * Server-Komponente fürs Layout. Liest die Schalter zur Laufzeit des
 * Servers — ohne `FEEDBACK=1` wird kein Client-Code des Werkzeugs geladen.
 *
 *   <FeedbackWerkzeug projekt="Straffälligenhilfe Krefeld" ziele={ZIELE} />
 */
export function FeedbackWerkzeug(props: {
  /** Steht im Export-Titel und in der KI-Begrüßung. */
  projekt: string;
  /** Derselbe Katalog wie in `feedbackRoute({ ki })`. */
  ziele?: ZielKatalog;
  /** Frage-Vorschläge im leeren KI-Fenster. */
  vorschlaege?: string[];
}) {
  if (process.env.FEEDBACK !== "1") return null;
  const ki = process.env.KI_HILFE === "1" && Boolean(props.ziele);
  return (
    <GrowcoreFeedback
      projekt={props.projekt}
      kiHilfe={ki}
      ziele={props.ziele ?? {}}
      vorschlaege={props.vorschlaege ?? []}
    />
  );
}

/**
 * Der `?`-Knopf für die Navigation — Server-Komponente mit demselben Schalter
 * wie `FeedbackWerkzeug`. Ohne `FEEDBACK=1` steht er nicht in der Seite.
 *
 *   <FeedbackKnopf className="…Icon-Knopf der Navigation…" />
 */
export function FeedbackKnopf(props: { className?: string }) {
  if (process.env.FEEDBACK !== "1") return null;
  return <AnmerkungsKnopf className={props.className} />;
}
