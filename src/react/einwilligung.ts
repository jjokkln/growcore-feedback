"use client";

import { useLocalStorageState } from "./hooks.ts";

/**
 * Die Einwilligung in die KI, gemerkt im Browser. Sie gilt für alles, was eine KI
 * mit Texten der Person macht: den Assistenten und (0.17.0) die Rückfragen zu
 * knappen Anmerkungen. Geändert wird `EINWILLIGUNG_STAND`, sobald sich ändert,
 * was mit den Daten passiert — dann fragt der Assistent erneut.
 *
 * `anthropic-2026-10b` (0.17.0): Frage UND Antwort werden 90 Tage aufbewahrt
 * (vorher: nur die Frage, 30 Tage).
 */
export const EINWILLIGUNG = "gcf-ki-einwilligung";
export const EINWILLIGUNG_STAND = "anthropic-2026-10b";

/** `true`, wenn die Person der aktuellen Fassung zugestimmt hat. */
export function useKiEinwilligung(): boolean {
  const [stand] = useLocalStorageState<string | null>(EINWILLIGUNG, null);
  return stand === EINWILLIGUNG_STAND;
}
