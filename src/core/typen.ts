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
import { BILD_MAX_ZEICHEN, KUNDEN_FARBEN, type Art, type Farbe, type Punkt } from "./konstanten.ts";

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
  /** 0.17.0: Zu dieser Anmerkung liegt ein Bild der Stelle beim Eingang. Das Bild selbst sieht nur GrowCore. */
  hat_bild?: boolean;
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

/** Grenzen der Umgebung (0.17.0), gespiegelt im Projektraum (`schema.ts`). */
export const umgebungSchema = z.object({
  host: z.string().trim().min(1).max(200),
  geraet: z.enum(["desktop", "tablet", "handy"]),
  browser: z.string().trim().min(1).max(60),
  os: z.string().trim().min(1).max(60),
  viewport_width: z.number().int().min(200).max(8000),
  viewport_height: z.number().int().min(100).max(8000),
  pixel_ratio: z.number().min(0.5).max(8),
  farbmodus: z.enum(["hell", "dunkel"]).optional(),
});

/** Das Bild der Stelle als JPEG-Data-URL (0.17.0), Obergrenze `BILD_MAX_ZEICHEN`. */
export const bildSchema = z
  .string()
  .max(BILD_MAX_ZEICHEN)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "Das Bild muss ein JPEG sein.");

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
    // Blau gehört Lenny: Der Projektraum nimmt es nur mit gültigem Zugang an, sonst wird es Rot.
    color: z.enum([...KUNDEN_FARBEN, "blau"]),
    viewport_width: z.number().int().min(200).max(8000).nullable(),
    /** Nur mit Lennys Zugang (0.15.0): Frage, Hinweis oder „Geändert“. */
    kind: z.enum(["question", "hint", "changed"]).optional(),
    /** 0.17.0: Gerät und Seite. Ältere Sammelstellen kennen das Feld nicht und ignorieren es. */
    umgebung: umgebungSchema.optional(),
    /** 0.17.0: Bild der Stelle, nur wenn die Sammelstelle es annimmt (Status `bild`). */
    screenshot: bildSchema.optional(),
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

/**
 * Die Personen, die für ein Projekt Anmerkungen setzen (0.9.0). Gepflegt bei der Sammelstelle
 * (Projektraum `/feedback`, galdora-network `/anmerkungen`); das Overlay zeigt sie als Auswahl
 * statt des freien Namensfelds. Nur Anzeigenamen, keine Kontaktdaten.
 */
export const personenSchema = z.array(z.string().trim().min(1).max(80)).max(50);

export const antwortSchema = z.object({
  body: z.string().trim().min(1, "Eine leere Antwort sagt nichts.").max(4000),
});

/** Daumen unter einer KI-Antwort (0.17.0): `frage_id` stammt aus dem `ende`-Ereignis. */
export const bewertungSchema = z.object({
  frage_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  wert: z.union([z.literal(1), z.literal(-1)]),
});
export type NeueBewertung = z.infer<typeof bewertungSchema>;

/**
 * Rückfrage zu einer knappen Anmerkung (0.17.0): Text, Seite und Beschriftung der
 * Stelle gehen an die Sammelstelle, zurück kommen null bis zwei Fragen.
 */
export const nachfrageSchema = z.object({
  text: z.string().trim().max(4000).nullable(),
  seite: pfad,
  stelle: z.string().trim().min(1).max(120),
  kind: z.enum(["question", "hint", "changed"]).nullish(),
});
export type NachfrageEingabe = z.infer<typeof nachfrageSchema>;
export const nachfrageAntwortSchema = z.object({ fragen: z.array(z.string().trim().min(1).max(300)).max(2) });

export const erledigtSchema = z.object({ done: z.boolean() });

/** Eine Stelle der Seite, die der KI-Assistent einkreisen kann (0.12.0). Nur Beschriftungen, kein Markup. */
export const stelleSchema = z.object({
  id: z.string().regex(/^s\d{1,3}$/),
  art: z.string().trim().min(1).max(24),
  label: z.string().trim().min(1).max(120),
});

/**
 * Eine Frage an den KI-Assistenten (0.12.0). Der Verlauf fährt bei jeder Frage
 * mit, dazu die sichtbaren Stellen der Seite. Die Grenzen spiegeln
 * `assistentSchema` im Projektraum (`src/lib/feedback/schema.ts`).
 */
export const assistentEingabeSchema = z.object({
  seite: pfad,
  nachrichten: z
    .array(
      z.object({
        rolle: z.enum(["nutzer", "ki"]),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30)
    .refine((n) => n[n.length - 1]?.rolle === "nutzer", "Die letzte Nachricht muss eine Frage sein.")
    .refine((n) => n.reduce((s, x) => s + x.text.length, 0) <= 30_000, "Der Verlauf ist zu lang."),
  stellen: z.array(stelleSchema).max(150).default([]),
});
export type KiNachricht = { rolle: "nutzer" | "ki"; text: string };

/** Eine Idee an Lenny (0.12.0): Knopf „Idee“ in der Leiste oder Vorschlag des Assistenten. */
export const ideeSchema = z.object({
  titel: z.string().trim().min(1, "Die Idee braucht einen Titel.").max(200),
  beschreibung: z.string().trim().max(4000).nullish(),
  seite: pfad.nullish(),
});
export type NeueIdee = z.infer<typeof ideeSchema>;
