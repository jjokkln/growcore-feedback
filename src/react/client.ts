/**
 * Der Weg vom Overlay zur eigenen Route (`/api/feedback/*`) der Kunden-App.
 *
 * Kein Konto: Beim ersten Besuch entsteht eine Kennung im localStorage. Sie
 * ist der Nachweis „das ist meine Anmerkung" und wird nur an den eigenen
 * Server geschickt, nie an andere Besucher ausgeliefert.
 */
import type { Anmerkung, KundenFarbe, NeueAnmerkung } from "../core/typen.ts";

const BASIS = "/api/feedback";
const KENNUNG = "gcf-autor";
const NAME = "gcf-name";

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

async function rufe<T>(pfad: string, init: RequestInit = {}): Promise<Ergebnis<T>> {
  try {
    const antwort = await fetch(`${BASIS}${pfad}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        "x-gcf-autor": kennung(),
        "x-gcf-name": encodeURIComponent(gespeicherterName() || "Gast"),
      },
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
  anlegen: (eingabe: NeueAnmerkung & { color: KundenFarbe }) =>
    rufe<{ anmerkung: Anmerkung }>("/anmerkungen", { method: "POST", body: JSON.stringify(eingabe) }),
  antworten: (id: string, body: string) =>
    rufe<{ ok: true }>(`/anmerkungen/${id}/antworten`, { method: "POST", body: JSON.stringify({ body }) }),
  erledigt: (id: string, done: boolean) =>
    rufe<{ ok: true }>(`/anmerkungen/${id}`, { method: "PATCH", body: JSON.stringify({ done }) }),
  loeschen: (id: string) => rufe<{ ok: true }>(`/anmerkungen/${id}`, { method: "DELETE", body: "{}" }),
  /** 0.9.0. Ältere Server kennen den Pfad nicht: dann `[]` und das freie Namensfeld. */
  personen: async (): Promise<string[]> => {
    const antwort = await rufe<{ personen?: unknown }>("/personen");
    if (!antwort.ok || !Array.isArray(antwort.daten.personen)) return [];
    return antwort.daten.personen.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  },
};
