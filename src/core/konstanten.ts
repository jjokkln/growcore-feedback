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
  question: "Frage von Lenny",
  hint: "Hinweis von Lenny",
  changed: "Geändert – bitte prüfen",
};

/** Der Vorname aus einer Beschriftung wie „Lenny (Lenny Helps)“ (0.16.6). */
export function vorname(label: string | null | undefined): string | null {
  return label?.trim().split(/[\s(]/)[0] || null;
}

/**
 * Was über einer Anmerkung der Agentur steht (0.16.6): „Frage von <Vorname>“
 * statt fest „von Lenny“. In Galdora fragt das Galdora-Team, nicht Lenny.
 */
export function agenturArt(kind: Art, autor: string | null | undefined): string {
  const name = vorname(autor) ?? "Lenny";
  if (kind === "question") return `Frage von ${name}`;
  if (kind === "hint") return `Hinweis von ${name}`;
  return ART_LABEL[kind];
}


/**
 * Pfad einer Anmerkung, die auf JEDER Seite gilt (0.14.0): Stellen im
 * seitenweiten Kopf- oder Fußbereich sehen auf allen Seiten gleich aus, also
 * soll die Anmerkung dort auch überall stehen (Lenny, 2026-10-15).
 */
export const ALLE_SEITEN = "/*";


/**
 * Wo und womit eine Anmerkung gesetzt wurde (0.17.0). Der Browser sammelt es
 * bei jeder neuen Anmerkung; es erspart die Rückfrage „am Handy oder am
 * Rechner?“ und sagt, ob die Stelle auf dem Entwurf, in der Vorschau oder live
 * liegt. Keine Kennung, keine Adresse des Besuchers — nur das Gerät.
 */
export type Umgebung = {
  /** `location.host`, z. B. „boston-club.vercel.app“ oder „localhost:3000“. */
  host: string;
  geraet: "desktop" | "tablet" | "handy";
  browser: string;
  os: string;
  viewport_width: number;
  viewport_height: number;
  pixel_ratio: number;
  farbmodus?: "hell" | "dunkel";
};

/**
 * Obergrenze des Bildes der Stelle (0.17.0) als Länge der Data-URL: 600 KB
 * dekodiert sind rund 800.000 Zeichen Base64. Hier und nicht in `typen.ts`,
 * weil der Browser sie braucht und zod nicht laden soll.
 */
export const BILD_MAX_ZEICHEN = 820_000;
