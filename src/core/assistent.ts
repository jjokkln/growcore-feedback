/**
 * Was der KI-Assistent (0.12.0) zurückschickt — gemeinsam für Browser und
 * Server, ohne zod (der Browser braucht nur die Typen).
 *
 * Der Projektraum antwortet als NDJSON, eine JSON-Zeile je Ereignis; die
 * Route der App reicht den Strom unverändert durch. Gelesen wird defensiv:
 * Eine Zeile, die keinem Ereignis entspricht, fällt weg.
 */

/** Eine Stelle der Seite, die der Assistent einkreisen darf. */
export type Stelle = { id: string; art: string; label: string };

export type MarkierenEingabe = { stelle: string; notiz: string; farbe: "rot" | "gruen" };
export type IdeeEingabe = { titel: string; beschreibung?: string };

export type AssistentEreignis =
  | { typ: "text"; text: string }
  /** Der Assistent sieht gerade im Projektraum nach. */
  | { typ: "werkzeug"; name: string; label: string }
  /** Ein Vorschlag, den erst der Klick der Person ausführt. */
  | { typ: "vorschlag"; werkzeug: "stelle_markieren"; eingabe: MarkierenEingabe }
  | { typ: "vorschlag"; werkzeug: "idee_vorschlagen"; eingabe: IdeeEingabe }
  | { typ: "fehler"; text: string }
  /** `frage_id` (0.17.0): Kennung der gespeicherten Frage, nötig für den Daumen. Fehlt bei älteren Sammelstellen. */
  | { typ: "ende"; text: string; frage_id?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (w: unknown, max: number): w is string => typeof w === "string" && w.length > 0 && w.length <= max;

export function leseEreignis(zeile: string): AssistentEreignis | null {
  let roh: Record<string, unknown>;
  try {
    roh = JSON.parse(zeile) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!roh || typeof roh !== "object") return null;
  switch (roh.typ) {
    case "text":
      return typeof roh.text === "string" ? { typ: "text", text: roh.text } : null;
    case "werkzeug":
      return text(roh.name, 80) ? { typ: "werkzeug", name: roh.name, label: text(roh.label, 120) ? roh.label : roh.name } : null;
    case "fehler":
      return { typ: "fehler", text: text(roh.text, 500) ? roh.text : "Das hat nicht geklappt." };
    case "ende":
      return {
        typ: "ende",
        text: typeof roh.text === "string" ? roh.text : "",
        ...(typeof roh.frage_id === "string" && UUID.test(roh.frage_id) ? { frage_id: roh.frage_id } : {}),
      };
    case "vorschlag": {
      const e = (roh.eingabe ?? {}) as Record<string, unknown>;
      if (roh.werkzeug === "stelle_markieren" && text(e.stelle, 8) && text(e.notiz, 1000)) {
        return {
          typ: "vorschlag",
          werkzeug: "stelle_markieren",
          eingabe: { stelle: e.stelle, notiz: e.notiz, farbe: e.farbe === "gruen" ? "gruen" : "rot" },
        };
      }
      if (roh.werkzeug === "idee_vorschlagen" && text(e.titel, 200)) {
        return {
          typ: "vorschlag",
          werkzeug: "idee_vorschlagen",
          eingabe: { titel: e.titel, ...(text(e.beschreibung, 4000) ? { beschreibung: e.beschreibung } : {}) },
        };
      }
      return null;
    }
    default:
      return null;
  }
}
