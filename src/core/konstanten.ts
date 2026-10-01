/**
 * Konstanten und Grundtypen des Werkzeugs, ohne zod — der Browser-Teil importiert
 * nur von hier (die eigenständige Fassung bliebe sonst 450 KB schwerer).
 * `typen.ts` re-exportiert alles, für Server und bestehende Importe.
 */

/** Ein Punkt als ANTEIL einer Bezugsfläche, nie als Pixel. */
export type Punkt = { x: number; y: number };

export const ALLE_FARBEN = ["rot", "blau", "gruen", "gold"] as const;
export type Farbe = (typeof ALLE_FARBEN)[number];

/** Rot „muss geändert werden", Grün alles andere. Blau gehört GrowCore. */
export const KUNDEN_FARBEN = ["rot", "gruen"] as const;
export type KundenFarbe = (typeof KUNDEN_FARBEN)[number];

/** Weiß als Ziffer darauf erreicht jeweils mindestens 4,5:1. */
export const FARBWERT: Record<Farbe, string> = {
  rot: "#c02c27",
  blau: "#1f5f9e",
  gruen: "#2a7547",
  gold: "#855708",
};

export const FARBNAME: Record<Farbe, string> = {
  rot: "Rot",
  blau: "Blau",
  gruen: "Grün",
  gold: "Gold",
};

/** `note` schreiben Besucher, alles andere setzt GrowCore im Projektraum. */
export const ARTEN = ["note", "question", "hint", "changed"] as const;
export type Art = (typeof ARTEN)[number];

export const ART_LABEL: Record<Art, string> = {
  note: "Anmerkung",
  question: "Frage von GrowCore",
  hint: "Hinweis von GrowCore",
  changed: "Geändert – bitte prüfen",
};

