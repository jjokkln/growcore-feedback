/**
 * Typen, Beschriftungen und Eingabeprüfung — gemeinsam für Browser und Server.
 *
 * Kein 'use client', kein Server-Import: Overlay und Route-Helfer lesen
 * dieselben Typen. Die Grenzen spiegeln das Schema des Eingangs
 * (lennys-projekte `src/lib/feedback/schema.ts`); was hier durchkommt, darf
 * dort nicht scheitern, sonst sieht der Kunde einen 500 statt eines Satzes.
 */
import { z } from "zod";

// Konstanten und Grundtypen ohne zod (0.8.0): Der Browser braucht nur sie, und zod wöge in der
// eigenständigen Fassung 450 KB. Hier weiter re-exportiert, damit alle Importe gleich bleiben.
export * from "./konstanten.ts";
import { KUNDEN_FARBEN, type Art, type Farbe, type Punkt } from "./konstanten.ts";

export type Antwort = {
  id: string;
  body: string;
  from_agency: boolean;
  author_label: string | null;
  created_at: string;
};

/**
 * Eine Anmerkung, so wie der Browser sie bekommt.
 *
 * ⚠️ `author_ref` fehlt absichtlich: Die Kennung ist zugleich der Nachweis,
 * dass man eine Anmerkung löschen darf. Der Route-Helfer ersetzt sie durch
 * `eigen` (stimmt sie mit der Kennung des Fragenden überein?).
 */
export type Anmerkung = {
  id: string;
  path: string;
  shape: "pin" | "stroke";
  kind: Art;
  body: string | null;
  anchor_selector: string;
  anchor_label: string;
  points: Punkt[];
  fallback: Punkt[];
  color: Farbe;
  viewport_width: number | null;
  from_agency: boolean;
  author_label: string | null;
  eigen: boolean;
  done: boolean;
  created_at: string;
  replies: Antwort[];
};

const punkt = z.object({
  x: z.number().finite().min(-2).max(3),
  y: z.number().finite().min(-2).max(3),
});

const pfad = z
  .string()
  .min(1)
  .max(200)
  .refine((w) => w.startsWith("/"), "Pfad muss mit / beginnen.");

/** Wer handelt. Ohne Konten erzeugt der Browser die Kennung selbst. */
export const autorSchema = z.object({
  label: z.string().trim().min(1).max(120),
  ref: z.string().min(8).max(200),
});
export type Autor = z.infer<typeof autorSchema>;

/**
 * Was der Besucher anlegt. Art und Herkunft sind nicht wählbar.
 *
 * Die Punkte dürfen über 0..1 hinaus: Ein Strich läuft gern über den Rand
 * seines Ankers. Unbegrenzt landeten sie als Transform im SVG.
 */
export const neueAnmerkungSchema = z
  .object({
    path: pfad,
    shape: z.enum(["pin", "stroke"]),
    body: z.string().trim().min(1).max(4000).nullable(),
    anchor_selector: z.string().min(1).max(500),
    anchor_label: z.string().trim().min(1).max(120),
    points: z.array(punkt).min(1).max(800),
    fallback: z.array(punkt).min(1).max(800),
    color: z.enum(KUNDEN_FARBEN),
    viewport_width: z.number().int().min(200).max(8000).nullable(),
  })
  .refine((w) => w.shape !== "pin" || Boolean(w.body), {
    message: "Ein Kommentar ohne Text wäre ein Punkt ohne Aussage.",
    path: ["body"],
  })
  .refine((w) => w.shape !== "stroke" || w.points.length >= 2, {
    message: "Ein Strich braucht mehr als einen Punkt.",
    path: ["points"],
  })
  .refine((w) => w.points.length === w.fallback.length, {
    message: "Anker- und Ersatzpunkte müssen sich entsprechen.",
    path: ["fallback"],
  });
export type NeueAnmerkung = z.infer<typeof neueAnmerkungSchema>;

export const antwortSchema = z.object({
  body: z.string().trim().min(1, "Eine leere Antwort sagt nichts.").max(4000),
});

export const erledigtSchema = z.object({ done: z.boolean() });

/** Eine Nachricht an die KI-Hilfe. Der Verlauf fährt bei jeder Frage mit. */
export const kiEingabeSchema = z.object({
  seite: pfad,
  nachrichten: z
    .array(
      z.object({
        rolle: z.enum(["nutzer", "ki"]),
        text: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20)
    .refine((n) => n[n.length - 1]?.rolle === "nutzer", "Die letzte Nachricht muss eine Frage sein.")
    .refine((n) => n.reduce((s, x) => s + x.text.length, 0) <= 12_000, "Der Verlauf ist zu lang."),
});
export type KiNachricht = { rolle: "nutzer" | "ki"; text: string };
