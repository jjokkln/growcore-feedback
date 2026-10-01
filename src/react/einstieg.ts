"use client";

import { useSyncExternalStore } from "react";

import { useLocalStorageState } from "./hooks.ts";

/**
 * Was der `?`-Knopf in der Navigation und das Overlay voneinander wissen.
 *
 * Die beiden sind getrennt eingebunden — der Knopf sitzt in der Kopfleiste
 * des Projekts, das Overlay per Portal an `document.body`. Ein gemeinsamer
 * React-Kontext ginge nur, wenn das Projekt beide unter denselben Provider
 * hängt; das wäre eine Einbauregel mehr, die man vergessen kann. Deshalb ein
 * Modul-Speicher: Beide importieren dasselbe Modul und damit denselben Stand.
 *
 * - `offen` steht im localStorage: Wer im Termin die Leiste aufhat, soll sie
 *   nach einem Neuladen nicht wieder suchen müssen.
 * - `knoepfe` zählt die eingebundenen Knöpfe. Ist keiner da (Seite ohne
 *   Navigation, Projekt noch nicht umgestellt), zeigt das Overlay als
 *   Notnagel den Stift unten links — ohne Einstieg käme man sonst nie hinein.
 * - `offeneAnzahl` meldet das Overlay, der Knopf zeigt sie als Zahl.
 */

const SCHLUESSEL = "gcf-leiste-offen";

type Stand = { knoepfe: number; offeneAnzahl: number };
let stand: Stand = { knoepfe: 0, offeneAnzahl: 0 };
const hoerer = new Set<() => void>();

function setzen(neu: Partial<Stand>) {
  const naechster = { ...stand, ...neu };
  if (naechster.knoepfe === stand.knoepfe && naechster.offeneAnzahl === stand.offeneAnzahl) return;
  stand = naechster;
  hoerer.forEach((h) => h());
}

function abonnieren(h: () => void) {
  hoerer.add(h);
  return () => {
    hoerer.delete(h);
  };
}

const LEER: Stand = { knoepfe: 0, offeneAnzahl: 0 };

export function useEinstieg(): Stand {
  return useSyncExternalStore(abonnieren, () => stand, () => LEER);
}

export function knopfAnmelden(): () => void {
  setzen({ knoepfe: stand.knoepfe + 1 });
  return () => setzen({ knoepfe: stand.knoepfe - 1 });
}

export function offeneMelden(anzahl: number) {
  setzen({ offeneAnzahl: anzahl });
}

/** Ob die Leiste offen ist. Standard: zu — der Einstieg ist der `?`-Knopf. */
export function useLeisteOffen(): [boolean, (offen: boolean) => void] {
  return useLocalStorageState(SCHLUESSEL, false);
}

// ─── Fernschalter (0.7.0) ──────────────────────────────────────────────────

/**
 * Ob das Werkzeug für dieses Projekt gerade eingeschaltet ist. Entschieden
 * wird es zentral — im Projektraum bzw. in der Sammelstelle des Projekts —,
 * gefragt wird über die eigene Route (`GET /api/feedback/status`).
 *
 * `null` = noch nicht bekannt. Bis die Antwort da ist, zeigt nichts sich:
 * lieber eine halbe Sekunde später als ein `?`, das gleich wieder verschwindet.
 * Nur ein ausdrückliches `{ an: true }` schaltet ein; jede andere Antwort,
 * auch ein Fehler, lässt das Werkzeug aus.
 *
 * Gefragt wird einmal je Seitenaufruf und erneut, wenn der Reiter wieder in
 * den Blick kommt — so wirkt ein Ausschalten ohne Neuladen.
 */
let an: boolean | null = null;
let laeuft = false;
let zuletzt = 0;
const anHoerer = new Set<() => void>();

async function anFragen(): Promise<void> {
  if (laeuft) return;
  laeuft = true;
  zuletzt = Date.now();
  let neu = false;
  try {
    const antwort = await fetch("/api/feedback/status", { cache: "no-store" });
    const daten = antwort.ok ? ((await antwort.json().catch(() => ({}))) as { an?: unknown }) : {};
    neu = daten.an === true;
  } catch {
    neu = false;
  }
  laeuft = false;
  if (neu !== an) {
    an = neu;
    anHoerer.forEach((h) => h());
  }
}

function anAbonnieren(h: () => void) {
  anHoerer.add(h);
  if (an === null) void anFragen();
  const beiSicht = () => {
    // Höchstens alle 20 s, sonst fragt jeder Reiterwechsel den Server.
    if (!document.hidden && Date.now() - zuletzt > 20_000) void anFragen();
  };
  document.addEventListener("visibilitychange", beiSicht);
  return () => {
    anHoerer.delete(h);
    document.removeEventListener("visibilitychange", beiSicht);
  };
}

/** `true` nur, wenn die Sammelstelle das Werkzeug für dieses Projekt eingeschaltet hat. */
export function useWerkzeugAn(): boolean {
  return useSyncExternalStore(anAbonnieren, () => an === true, () => false);
}
