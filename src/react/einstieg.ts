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
