"use client";

/**
 * Verschieben mit Maus, Finger und Tastatur — für die Leiste und die
 * Kommentarfenster. Ohne Bibliothek: ein Zug ist `pointerdown` am Griff, dann
 * `pointermove`/`pointerup` am Fenster (nicht am Griff, sonst reißt der Zug
 * ab, sobald der Zeiger schneller ist als das Element).
 */

export type Versatz = { x: number; y: number };

/** Ab so vielen Pixeln ist es ein Zug und kein Klick. */
const SCHWELLE = 4;

/**
 * Startet einen Zug. `beiZug` bekommt die Verschiebung seit dem Start, `beiEnde`
 * zusätzlich, ob überhaupt gezogen wurde — ein Klick ohne Bewegung soll das
 * bleiben, was er ist (Zettel öffnen).
 */
export function ziehenStarten(
  e: { clientX: number; clientY: number; button?: number },
  ruf: {
    beiZug: (d: Versatz) => void;
    beiEnde?: (d: Versatz, bewegt: boolean) => void;
  },
): void {
  if (e.button !== undefined && e.button !== 0) return;
  const start = { x: e.clientX, y: e.clientY };
  let bewegt = false;
  let letzte: Versatz = { x: 0, y: 0 };

  const zug = (ev: PointerEvent) => {
    letzte = { x: ev.clientX - start.x, y: ev.clientY - start.y };
    if (!bewegt && Math.hypot(letzte.x, letzte.y) < SCHWELLE) return;
    bewegt = true;
    ev.preventDefault();
    ruf.beiZug(letzte);
  };
  const ende = () => {
    window.removeEventListener("pointermove", zug);
    window.removeEventListener("pointerup", ende);
    window.removeEventListener("pointercancel", ende);
    document.documentElement.style.removeProperty("user-select");
    ruf.beiEnde?.(letzte, bewegt);
  };

  // Ohne das markiert der Zug nebenbei den Text der Seite.
  document.documentElement.style.userSelect = "none";
  window.addEventListener("pointermove", zug);
  window.addEventListener("pointerup", ende);
  window.addEventListener("pointercancel", ende);
}

/** Pfeiltasten am Griff: 16 px je Druck, mit Umschalt 64 px. Sonst `null`. */
export function pfeilVersatz(e: { key: string; shiftKey: boolean }): Versatz | null {
  const s = e.shiftKey ? 64 : 16;
  switch (e.key) {
    case "ArrowLeft":
      return { x: -s, y: 0 };
    case "ArrowRight":
      return { x: s, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -s };
    case "ArrowDown":
      return { x: 0, y: s };
    default:
      return null;
  }
}

/** Umriss einer Marke in Viewport-Punkten — beim Punkt nur der Punkt selbst. */
export type Rahmen = { links: number; oben: number; rechts: number; unten: number };

export function rahmenVon(punkte: Versatz[]): Rahmen {
  let links = Infinity;
  let oben = Infinity;
  let rechts = -Infinity;
  let unten = -Infinity;
  for (const p of punkte) {
    links = Math.min(links, p.x);
    oben = Math.min(oben, p.y);
    rechts = Math.max(rechts, p.x);
    unten = Math.max(unten, p.y);
  }
  return { links, oben, rechts, unten };
}

/**
 * Wie weit ein Kommentarfenster von seiner Marke weg darf: Sein nächster Rand
 * bleibt innerhalb dieses Abstands um den Punkt bzw. um den eingekreisten
 * Bereich. Weiter weg ginge die Zuordnung verloren, auch mit Linie.
 */
export const RADIUS = 220;

/**
 * Begrenzt den Versatz `v` (gemessen ab dem Absetzpunkt `p`, er verschiebt
 * die linke obere Ecke) so, dass das Fenster der Größe `groesse` den Rahmen
 * plus `RADIUS` noch berührt. Ohne Größe zählt nur die Ecke.
 */
export function begrenzen(
  p: Versatz,
  v: Versatz,
  rahmen: Rahmen,
  groesse: { w: number; h: number } = { w: 0, h: 0 },
): Versatz {
  const x = Math.min(Math.max(p.x + v.x, rahmen.links - RADIUS - groesse.w), rahmen.rechts + RADIUS);
  const y = Math.min(Math.max(p.y + v.y, rahmen.oben - RADIUS - groesse.h), rahmen.unten + RADIUS);
  return { x: Math.round(x - p.x), y: Math.round(y - p.y) };
}
