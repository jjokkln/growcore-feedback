import type { ZielKatalog } from "../core/ziele.ts";
import { FeedbackLader, KnopfLader } from "../react/lader.tsx";
import type { OverlayModus } from "../react/overlay.tsx";

/**
 * Server-Komponente fürs Layout. Liest die Schalter zur Laufzeit des
 * Servers — ohne `FEEDBACK=1` wird kein Client-Code des Werkzeugs geladen.
 *
 * Seit 0.17.0 wirklich: Der Client-Code kommt als eigener Chunk (`FeedbackLader`)
 * und steht nur im HTML, wenn `FEEDBACK=1`. Vorher hing er an jeder Seite des
 * Projekts, auch bei `FEEDBACK` aus (gemessen an bejob-landing: rund 24 KB gz).
 * Warum ein Lader im Browser und kein `import()` hier: siehe `react/lader.tsx`.
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
  /** Datensparsam-Modus, ohne Namensfeld, Hinweiszeile. Siehe `OverlayModus`. */
  modus?: OverlayModus;
}) {
  if (process.env.FEEDBACK !== "1") return null;
  const ki = process.env.KI_HILFE === "1" && Boolean(props.ziele);
  return (
    <FeedbackLader
      projekt={props.projekt}
      kiHilfe={ki}
      ziele={props.ziele ?? {}}
      vorschlaege={props.vorschlaege ?? []}
      modus={props.modus}
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
  return <KnopfLader className={props.className} />;
}
