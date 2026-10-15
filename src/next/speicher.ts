import type { Stelle } from "../core/assistent.ts";
import type { Anmerkung, Antwort, Autor, KiNachricht, NeueAnmerkung, NeueIdee } from "../core/typen.ts";
import type { SammelstellenWissen } from "./anweisungen.ts";
import { eingang, eingangPersonen, eingangStatus, eingangStrom } from "./eingang.ts";

/** Eine Anmerkung samt Kennung des Autors, wie der Server sie kennt. Die Kennung geht nie zum Browser. */
export type Zeile = Omit<Anmerkung, "eigen" | "replies"> & {
  author_ref?: string | null;
  replies?: Array<Antwort & { author_ref?: string | null }>;
};

/** Was die Route an den Assistenten der Sammelstelle weiterreicht (0.12.0). */
export type AssistentAnfrage = {
  seite: string;
  nachrichten: KiNachricht[];
  stellen: Stelle[];
  /** Anzeigename aus dem Overlay, `null` ohne Namen. */
  autor: string | null;
  wissen: SammelstellenWissen;
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
  /**
   * `agentur` (0.15.0): Lennys signierter Zugang aus dem Projektraum, unverändert
   * weitergereicht. Nur die Sammelstelle kann ihn prüfen; ein eigener Speicher
   * ohne Agentur-Modus ignoriert ihn.
   */
  anlegen(neu: NeueAnmerkung, autor: Autor, agentur?: string | null): Promise<Zeile>;
  antworten(id: string, body: string, autor: Autor, agentur?: string | null): Promise<void>;
  erledigt(id: string, done: boolean, autor: Autor): Promise<void>;
  loeschen(id: string, autor: Autor, agentur?: string | null): Promise<void>;
  /**
   * @deprecated Seit 0.12.0 ungenutzt: Die Sammelstelle hält die Frage selbst fest,
   * wenn sie den Assistenten beantwortet (`assistent`). Bleibt nur, damit eigene
   * Speicher älterer Fassungen weiter kompilieren.
   */
  kiFrage?(frage: string, seite: string, autor: Autor | null): Promise<void>;
  /**
   * Optional (0.12.0): der KI-Assistent der Sammelstelle. Liefert den Antwortstrom
   * als NDJSON (`AssistentEreignis` je Zeile). Ohne diese Funktion gibt es keinen
   * Assistenten, auch nicht mit `KI_HILFE=1`.
   */
  assistent?(anfrage: AssistentAnfrage, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  /**
   * Optional (0.12.0): eine Idee an die Sammelstelle (im Projektraum ein Vorschlag).
   * Ohne diese Funktion zeigt das Overlay keinen Knopf „Idee“.
   */
  idee?(idee: NeueIdee, autor: Autor): Promise<void>;
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
  anlegen: async (neu, autor, agentur) =>
    (
      await eingang<{ anmerkung: Zeile }>("/anmerkungen", {
        method: "POST",
        body: { ...neu, author: autor, ...(agentur ? { agentur } : {}) },
      })
    ).anmerkung,
  antworten: async (id, body, autor, agentur) => {
    await eingang(`/anmerkungen/${id}/antworten`, {
      method: "POST",
      body: { body, author: autor, ...(agentur ? { agentur } : {}) },
    });
  },
  erledigt: async (id, done, autor) => {
    await eingang(`/anmerkungen/${id}`, { method: "PATCH", body: { done, author: autor } });
  },
  loeschen: async (id, autor, agentur) => {
    await eingang(`/anmerkungen/${id}`, { method: "DELETE", body: { author: autor, ...(agentur ? { agentur } : {}) } });
  },
  assistent: (anfrage, signal) => eingangStrom("/assistent", anfrage, signal),
  idee: async (idee, autor) => {
    await eingang("/ideen", { method: "POST", body: { ...idee, author: autor } });
  },
  status: eingangStatus,
  personen: eingangPersonen,
};
