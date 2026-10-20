import { BILD_MAX_ZEICHEN } from "../core/konstanten.ts";

/**
 * Das Bild der Stelle (0.17.0): Der Abschnitt, an dem die Anmerkung hängt, als
 * JPEG, damit Lenny sieht, was gemeint war — auch wenn die Seite sich
 * inzwischen geändert hat.
 *
 * Läuft vollständig im Browser (`html-to-image`, lokal gebündelt, kein
 * Dienst eines Dritten) und wird erst geladen, wenn tatsächlich eine Anmerkung
 * gespeichert wird (dynamischer Import). Scheitert irgendetwas — Zeitüberschreitung,
 * ein Bild ohne CORS, ein zu großes Ergebnis —, ist das Ergebnis `null` und
 * die Anmerkung wird ohne Bild gespeichert. Das Bild darf das Speichern nie verhindern.
 *
 * Nicht im Bild: das Werkzeug selbst (`data-review-ui`, `data-ki-ui`).
 * Gedacht für Seiten ohne Personendaten; Apps mit Personendaten setzen
 * `datensparsam` und bekommen nie ein Bild.
 */

const MAX_BREITE = 900;
const MAX_HOEHE = 1400;
const FRIST_MS = 6000;

const ohneWerkzeug = (knoten: Node): boolean =>
  !(knoten instanceof Element && knoten.closest("[data-review-ui],[data-ki-ui],[data-gcf-wurzel]"));

function frist<T>(versprechen: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((ok, nein) => {
    const id = setTimeout(() => nein(new Error("Zeit abgelaufen")), ms);
    versprechen.then(
      (w) => {
        clearTimeout(id);
        ok(w);
      },
      (e) => {
        clearTimeout(id);
        nein(e);
      },
    );
  });
}

export async function stelleAlsBild(el: Element): Promise<string | null> {
  try {
    const box = el.getBoundingClientRect();
    if (box.width < 24 || box.height < 24) return null;
    const { toJpeg } = await import("html-to-image");
    const hoehe = Math.round(Math.min(box.height, MAX_HOEHE));
    const grund = getComputedStyle(document.body).backgroundColor;
    const hintergrund = !grund || grund === "rgba(0, 0, 0, 0)" ? "#ffffff" : grund;

    // Erst in guter Größe, passt es nicht, kleiner und gröber — dann ist Schluss.
    for (const [qualitaet, faktor] of [
      [0.6, 1],
      [0.4, 0.6],
    ] as const) {
      const skala = Math.min(2, (MAX_BREITE / box.width) * faktor);
      const url = await frist(
        toJpeg(el as HTMLElement, {
          quality: qualitaet,
          pixelRatio: skala,
          backgroundColor: hintergrund,
          width: Math.round(box.width),
          height: hoehe,
          filter: ohneWerkzeug,
        }),
        FRIST_MS,
      );
      if (url.length <= BILD_MAX_ZEICHEN) return url;
    }
    return null;
  } catch {
    return null;
  }
}
