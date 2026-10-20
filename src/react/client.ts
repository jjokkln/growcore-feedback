/**
 * Der Weg vom Overlay zur eigenen Route (`/api/feedback/*`) der Kunden-App.
 *
 * Kein Konto: Beim ersten Besuch entsteht eine Kennung im localStorage. Sie
 * ist der Nachweis „das ist meine Anmerkung" und wird nur an den eigenen
 * Server geschickt, nie an andere Besucher ausgeliefert.
 */
import type { Anmerkung, NeueAnmerkung, NeueBewertung, NeueIdee } from "../core/typen.ts";
import { agenturZugang } from "./agentur.ts";

const BASIS = "/api/feedback";
const KENNUNG = "gcf-autor";
const NAME = "gcf-name";

/**
 * Die Kennung, falls es schon eine gibt. Lesen legt nichts an (0.17.0, § 25 TDDDG):
 * Wer die Seite nur ansieht, bekommt keine Zufallskennung im Browser. Sie entsteht
 * erst beim ersten Schreiben — Anmerkung, Antwort, Frage an die KI.
 */
export function kennungLesen(): string | null {
  try {
    const vorhanden = localStorage.getItem(KENNUNG);
    if (vorhanden && vorhanden.length >= 8) return vorhanden;
  } catch {
    // blockierter Speicher: nur die Kennung dieses Seitenaufrufs, falls schon eine entstand
  }
  return (globalThis as { __gcfKennung?: string }).__gcfKennung ?? null;
}

/** Die Kennung, bei Bedarf neu angelegt. Nur aufrufen, wenn jemand etwas schreibt. */
export function kennung(): string {
  try {
    const vorhanden = localStorage.getItem(KENNUNG);
    if (vorhanden && vorhanden.length >= 8) return vorhanden;
    const neu = crypto.randomUUID();
    localStorage.setItem(KENNUNG, neu);
    return neu;
  } catch {
    // Blockierter Speicher: eine Kennung je Seitenaufruf. Eigene Anmerkungen
    // lassen sich dann nach dem Neuladen nicht mehr löschen, alles andere geht.
    return (globalThis as { __gcfKennung?: string }).__gcfKennung ??= crypto.randomUUID();
  }
}

export function gespeicherterName(): string {
  try {
    return localStorage.getItem(NAME) ?? "";
  } catch {
    return "";
  }
}

export function nameMerken(name: string): void {
  try {
    if (name.trim()) localStorage.setItem(NAME, name.trim().slice(0, 120));
  } catch {
    // ohne Speicher: gilt nur für diesen Aufruf
  }
}

type Ergebnis<T> = { ok: true; daten: T } | { ok: false; fehler: string };

/**
 * Wer fragt — dieselben Kopfzeilen für jeden Aufruf der eigenen Route.
 * `schreibend` legt die Kennung an; ein lesender Aufruf schickt nur eine vorhandene.
 */
export function kopfzeilen(mitJson: boolean, schreibend = mitJson): Record<string, string> {
  const ref = schreibend ? kennung() : kennungLesen();
  return {
    ...(mitJson ? { "content-type": "application/json" } : {}),
    ...(ref ? { "x-gcf-autor": ref } : {}),
    "x-gcf-name": encodeURIComponent(gespeicherterName() || "Gast"),
    ...(agenturZugang() ? { "x-gcf-agentur": agenturZugang()! } : {}),
  };
}

async function rufe<T>(pfad: string, init: RequestInit = {}): Promise<Ergebnis<T>> {
  try {
    const antwort = await fetch(`${BASIS}${pfad}`, {
      ...init,
      headers: kopfzeilen(Boolean(init.body), Boolean(init.method) && init.method !== "GET"),
      cache: "no-store",
    });
    const daten = (await antwort.json().catch(() => ({}))) as T & { fehler?: string };
    if (!antwort.ok) return { ok: false, fehler: daten.fehler ?? "Das hat nicht geklappt." };
    return { ok: true, daten };
  } catch {
    return { ok: false, fehler: "Keine Verbindung. Bitte gleich noch einmal versuchen." };
  }
}

export const feedbackApi = {
  laden: () => rufe<{ anmerkungen: Anmerkung[] }>("/anmerkungen"),
  anlegen: (eingabe: NeueAnmerkung) =>
    rufe<{ anmerkung: Anmerkung }>("/anmerkungen", { method: "POST", body: JSON.stringify(eingabe) }),
  antworten: (id: string, body: string) =>
    rufe<{ ok: true }>(`/anmerkungen/${id}/antworten`, { method: "POST", body: JSON.stringify({ body }) }),
  erledigt: (id: string, done: boolean) =>
    rufe<{ ok: true }>(`/anmerkungen/${id}`, { method: "PATCH", body: JSON.stringify({ done }) }),
  loeschen: (id: string) => rufe<{ ok: true }>(`/anmerkungen/${id}`, { method: "DELETE", body: "{}" }),
  /** 0.12.0: eine Idee an Lenny (im Projektraum ein Vorschlag). */
  idee: (idee: NeueIdee) => rufe<{ ok: true }>("/ideen", { method: "POST", body: JSON.stringify(idee) }),
  /**
   * 0.17.0: Daumen unter einer KI-Antwort. Scheitert still (ältere Sammelstelle,
   * kein Netz): Die Bewertung ist ein Zusatz, kein Grund für eine Fehlermeldung.
   */
  bewerten: async (bewertung: NeueBewertung): Promise<boolean> =>
    (await rufe<{ ok: true }>("/ki-bewertung", { method: "POST", body: JSON.stringify(bewertung) })).ok,
  /**
   * 0.17.0: Rückfragen zu einer knappen Anmerkung. `[]` bei jedem Fehler: Dann
   * wird einfach gespeichert.
   */
  nachfrage: async (eingabe: { text: string | null; seite: string; stelle: string; kind?: string }): Promise<string[]> => {
    const antwort = await rufe<{ fragen?: unknown }>("/nachfrage", { method: "POST", body: JSON.stringify(eingabe) });
    if (!antwort.ok || !Array.isArray(antwort.daten.fragen)) return [];
    return antwort.daten.fragen.filter((f): f is string => typeof f === "string" && f.trim().length > 0).slice(0, 2);
  },
  /** 0.9.0. Ältere Server kennen den Pfad nicht: dann `[]` und das freie Namensfeld. */
  personen: async (): Promise<string[]> => {
    const antwort = await rufe<{ personen?: unknown }>("/personen");
    if (!antwort.ok || !Array.isArray(antwort.daten.personen)) return [];
    return antwort.daten.personen.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  },
};
