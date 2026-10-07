import type { Anmerkung, Antwort, Autor, NeueAnmerkung } from "../core/typen.ts";
import { eingang, eingangPersonen, eingangStatus } from "./eingang.ts";

/** Eine Anmerkung samt Kennung des Autors, wie der Server sie kennt. Die Kennung geht nie zum Browser. */
export type Zeile = Omit<Anmerkung, "eigen" | "replies"> & {
  author_ref?: string | null;
  replies?: Array<Antwort & { author_ref?: string | null }>;
};

/**
 * Wo die Anmerkungen liegen. Standard: der zentrale Eingang im Projektraum
 * (`eingangsSpeicher`). Ein Projekt, dessen Seiten Personendaten zeigen, hängt
 * einen eigenen Speicher ein (`feedbackRoute({ speicher })`) und behält alles
 * in der eigenen Datenbank.
 *
 * Fehler als `EingangFehler(status, text)` werfen: Die Route macht daraus die
 * Antwort an den Browser. Jeder andere Fehler wird zu einem neutralen 500.
 *
 * ⚠️ Rechte prüft der Speicher NICHT. Die Route hat vorher die Identität
 * festgestellt (`identitaet`); ob diese Person lesen und schreiben darf, ist
 * dort entschieden. `loeschen` und `erledigt` müssen aber selbst prüfen, dass
 * `autor.ref` zur Anmerkung passt, wo das gelten soll.
 */
export interface FeedbackSpeicher {
  liste(): Promise<Zeile[]>;
  anlegen(neu: NeueAnmerkung, autor: Autor): Promise<Zeile>;
  antworten(id: string, body: string, autor: Autor): Promise<void>;
  erledigt(id: string, done: boolean, autor: Autor): Promise<void>;
  loeschen(id: string, autor: Autor): Promise<void>;
  /** Optional. Ohne diese Funktion wird der Wortlaut einer KI-Frage nirgends festgehalten. */
  kiFrage?(frage: string, seite: string, autor: Autor | null): Promise<void>;
  /**
   * Optional (0.7.0): Ist das Werkzeug für dieses Projekt eingeschaltet? Der
   * Schalter liegt bei der Sammelstelle, nicht in der App. Ohne diese
   * Funktion gilt „an" — dann entscheidet allein `FEEDBACK=1`.
   */
  status?(): Promise<boolean>;
  /**
   * Optional (0.9.0): Wer darf sich als Autor auswählen? Anzeigenamen, gepflegt bei der
   * Sammelstelle. Leer oder ohne diese Funktion bleibt es beim freien Namensfeld.
   */
  personen?(): Promise<string[]>;
}

/** Der Standard: alles über den Projektschlüssel an den Eingang im Projektraum. */
export const eingangsSpeicher: FeedbackSpeicher = {
  liste: async () => (await eingang<{ anmerkungen: Zeile[] }>("/anmerkungen", { method: "GET" })).anmerkungen,
  anlegen: async (neu, autor) =>
    (await eingang<{ anmerkung: Zeile }>("/anmerkungen", { method: "POST", body: { ...neu, author: autor } }))
      .anmerkung,
  antworten: async (id, body, autor) => {
    await eingang(`/anmerkungen/${id}/antworten`, { method: "POST", body: { body, author: autor } });
  },
  erledigt: async (id, done, autor) => {
    await eingang(`/anmerkungen/${id}`, { method: "PATCH", body: { done, author: autor } });
  },
  loeschen: async (id, autor) => {
    await eingang(`/anmerkungen/${id}`, { method: "DELETE", body: { author: autor } });
  },
  kiFrage: async (frage, seite) => {
    await eingang("/ki-fragen", { method: "POST", body: { question: frage.slice(0, 2000), path: seite } });
  },
  status: eingangStatus,
  personen: eingangPersonen,
};
