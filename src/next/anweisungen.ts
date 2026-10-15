import type { ZielKatalog } from "../core/ziele.ts";

/**
 * Was der KI-Assistent über die Seite weiß. Gepflegt im Projekt
 * (`content/ki-wissen.ts`), übergeben an `feedbackRoute({ ki })`.
 *
 * Seit 0.12.0 schreibt der Projektraum die Systemanweisung, nicht mehr das
 * Paket: Die App schickt dieses Wissen mit jeder Frage an die Sammelstelle
 * (`wissenFuerSammelstelle`), dort antwortet Claude Haiku 5.5 mit Projektdaten
 * (growcore-feedback DECISIONS 2026-10-15). Der Wissenstext bleibt die
 * EINZIGE Quelle für alles, was auf der Seite steht — die KI erfindet nichts
 * dazu (Pflichtkern 5).
 */
export interface KiWissen {
  /** Wie die Seite heißt, z. B. „Website der Straffälligenhilfe Krefeld". */
  produkt: string;
  /** Der freigegebene Wissenstext. Die KI antwortet über die Seite nur daraus. */
  wissen: string;
  ziele: ZielKatalog;
  /** Wohin die KI verweist, wenn sie etwas nicht weiß. Steht hinter „empfiehl, …“, also im Infinitiv. */
  weiterleitung?: string;
  /** Wofür die Seite da ist, als kurzer Satz (0.10.0). */
  aufgabe?: string;
  /** „du“ oder „Sie“ (Standard), passend zur Anrede der Anwendung (0.10.0). */
  anrede?: "du" | "Sie";
  /**
   * An wen sich jemand mit seiner persönlichen oder rechtlichen Lage wenden soll,
   * im Akkusativ: „die Administration von Galdora“ (0.10.0). Standard: Lenny.
   */
  ansprechpartner?: string;
}

/** Das Wissen in der Form, die der Projektraum erwartet (`assistentSchema.wissen`). */
export type SammelstellenWissen = {
  produkt: string;
  text: string;
  ziele: Array<{ id: string; name: string; seite?: string }>;
  aufgabe?: string;
  anrede?: "du" | "Sie";
  ansprechpartner?: string;
  weiterleitung?: string;
};

export function wissenFuerSammelstelle(k: KiWissen): SammelstellenWissen {
  return {
    produkt: k.produkt.slice(0, 200),
    text: k.wissen.slice(0, 40_000),
    ziele: Object.entries(k.ziele)
      .slice(0, 100)
      .map(([id, z]) => ({ id: id.slice(0, 60), name: z.name.slice(0, 200), ...(z.seite ? { seite: z.seite } : {}) })),
    ...(k.aufgabe ? { aufgabe: k.aufgabe.slice(0, 500) } : {}),
    ...(k.anrede ? { anrede: k.anrede } : {}),
    ...(k.ansprechpartner ? { ansprechpartner: k.ansprechpartner.slice(0, 200) } : {}),
    ...(k.weiterleitung ? { weiterleitung: k.weiterleitung.slice(0, 300) } : {}),
  };
}
