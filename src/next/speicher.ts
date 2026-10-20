import type { Stelle } from "../core/assistent.ts";
import type { Anmerkung, Antwort, Autor, KiNachricht, NachfrageEingabe, NeueAnmerkung, NeueBewertung, NeueIdee } from "../core/typen.ts";
import type { SammelstellenWissen } from "./anweisungen.ts";
import { eingang, eingangPersonen, eingangStatus, eingangStrom } from "./eingang.ts";
import { nachfrageAntwortSchema } from "../core/typen.ts";

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
   * Optional (0.17.0): Daumen unter einer KI-Antwort. Nur die Sammelstelle, die den
   * Assistenten beantwortet, kennt die Frage.
   */
  bewerten?(bewertung: NeueBewertung, autor: Autor | null): Promise<void>;
  /**
   * Optional (0.17.0): Rückfragen zu einer knappen Anmerkung (0 bis 2). Leer =
   * der Text reicht. Ohne diese Funktion gibt es den Schritt nicht.
   */
  nachfrage?(eingabe: NachfrageEingabe): Promise<string[]>;
  /**
   * 0.17.0: Der Speicher nimmt `umgebung` und `screenshot` einer neuen Anmerkung an.
   * Ohne dieses Kennzeichen entfernt die Route beides, bevor `anlegen` aufgerufen
   * wird: Ein eigener Speicher kennt die Spalten nicht und soll nicht scheitern.
   */
  erweitert?: boolean;
  /**
   * Optional (0.12.0): eine Idee an die Sammelstelle (im Projektraum ein Vorschlag).
   * Ohne diese Funktion zeigt das Overlay keinen Knopf „Idee“.
   */
  idee?(idee: NeueIdee, autor: Autor): Promise<void>;
  /**
   * Optional (0.7.0): Ist das Werkzeug für dieses Projekt eingeschaltet? Der
   * Schalter liegt bei der Sammelstelle, nicht in der App. Ohne diese
   * Funktion gilt „an" — dann entscheidet allein `FEEDBACK=1`.
   *
   * Seit 0.16.2 darf die Antwort auch sagen, was die Sammelstelle kann
   * (`SammelstellenStatus`): Fehlt dort `assistent` oder `ideen`, zeigt das
   * Overlay den Teil nicht, auch wenn der Speicher die Funktion hat. Sonst
   * stünde „Idee“ in einer App, deren Sammelstelle den Pfad nicht kennt.
   */
  status?(): Promise<boolean | SammelstellenStatus>;
  /**
   * Optional (0.9.0): Wer darf sich als Autor auswählen? Anzeigenamen, gepflegt bei der
   * Sammelstelle. Leer oder ohne diese Funktion bleibt es beim freien Namensfeld.
   */
  personen?(): Promise<string[]>;
}

/** Was die Sammelstelle meldet (0.16.2). Fehlt ein Feld, gilt „kann es“. */
export type SammelstellenStatus = {
  an: boolean;
  assistent?: boolean;
  ideen?: boolean;
  /** 0.17.0: Die Sammelstelle nimmt Bilder der Stelle an (Projektschalter). */
  bild?: boolean;
  /** 0.17.0: Die Sammelstelle beantwortet Rückfragen zu knappen Anmerkungen. */
  nachfrage?: boolean;
};

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
  bewerten: async (bewertung, autor) => {
    await eingang("/ki-bewertung", { method: "POST", body: { ...bewertung, ...(autor ? { author: autor } : {}) } });
  },
  nachfrage: async (eingabe) => {
    const antwort = await eingang<unknown>("/nachfrage", { method: "POST", body: eingabe });
    const geprueft = nachfrageAntwortSchema.safeParse(antwort);
    return geprueft.success ? geprueft.data.fragen : [];
  },
  erweitert: true,
  status: eingangStatus,
  personen: eingangPersonen,
};

/**
 * Der KI-Assistent über den Projektraum, auch wenn die Anmerkungen woanders
 * liegen (0.16.4). Für Apps mit eigener Sammelstelle (Galdora: galdora-network),
 * die trotzdem den Assistenten wollen: Die Fragen gehen mit einem eigenen
 * Projektschlüssel an den Projektraum, Kosten stehen dort beim Projekt.
 *
 *   speicher: { ...meinSpeicher, assistent: assistentUeberProjektraum() }
 *
 * Ohne Schlüssel (Standard: `GROWCORE_KI_KEY`) ergibt das `undefined`, und das
 * Overlay zeigt keinen KI-Knopf. Meldet die eigene Sammelstelle `status()`,
 * muss sie `assistent` dort nicht abstreiten (siehe `SammelstellenStatus`).
 */
export function assistentUeberProjektraum(
  ziel: { schluessel?: string; url?: string } = {
    schluessel: process.env.GROWCORE_KI_KEY,
    url: process.env.GROWCORE_KI_URL,
  },
): FeedbackSpeicher["assistent"] {
  if (!ziel.schluessel?.trim()) return undefined;
  return (anfrage, signal) => eingangStrom("/assistent", anfrage, signal, ziel);
}
