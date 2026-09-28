import type { ZielKatalog } from "../core/ziele.ts";
import { GrowcoreFeedback } from "../react/feedback.tsx";

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
