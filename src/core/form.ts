/**
 * Aus einem gekritzelten Kreis wird ein ordentlicher (0.13.0) — wie in Apple
 * Notizen, nur ohne Warten: Ist der Zug geschlossen, ersetzt ihn eine Ellipse
 * oder, wenn er eckig gezeichnet wurde, ein Rechteck. Beide gedreht wie der
 * Zug; fast waagerecht wird waagerecht. Ein offener Zug (Unterstreichung,
 * Pfeil, Haken) bleibt, wie er ist.
 *
 * Rein rechnerisch, ohne DOM: Eingabe und Ausgabe sind Viewport-Punkte, die
 * Verankerung passiert danach wie bei jedem Zug.
 */
import type { Punkt } from "./konstanten.ts";

export type Form = "ellipse" | "rechteck";

/** Unter dieser Größe (Diagonale in px) wird nichts geglättet: Das ist ein Punkt, kein Kreis. */
const MIN_GROESSE = 30;
/** Fast waagerecht (Grad) gilt als waagerecht. */
const EINRASTEN = 10;

function abstand(a: Punkt, b: Punkt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Wie weit der Zug um seinen Schwerpunkt herumläuft, in Bogenmaß (Vorzeichen egal). */
function umlauf(punkte: Punkt[], m: Punkt): number {
  let summe = 0;
  let vorher = Math.atan2(punkte[0].y - m.y, punkte[0].x - m.x);
  for (const p of punkte.slice(1)) {
    const w = Math.atan2(p.y - m.y, p.x - m.x);
    let d = w - vorher;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    summe += d;
    vorher = w;
  }
  return Math.abs(summe);
}

export function glaetteZug(punkte: Punkt[]): { punkte: Punkt[]; form: Form } | null {
  if (punkte.length < 8) return null;

  const xs = punkte.map((p) => p.x);
  const ys = punkte.map((p) => p.y);
  const diagonale = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (diagonale < MIN_GROESSE) return null;

  const m = {
    x: xs.reduce((s, x) => s + x, 0) / punkte.length,
    y: ys.reduce((s, y) => s + y, 0) / punkte.length,
  };
  // Geschlossen: Ende nahe am Anfang, oder fast einmal ganz herum (≥ 300°).
  const geschlossen =
    abstand(punkte[0], punkte[punkte.length - 1]) <= diagonale * 0.3 || umlauf(punkte, m) >= (300 / 180) * Math.PI;
  if (!geschlossen) return null;

  // Hauptachse aus der Kovarianz: So liegt eine schräg gezeichnete Ellipse richtig.
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of punkte) {
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  let winkel = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // Auf ±45° bringen: Breite und Höhe bleiben dann Breite und Höhe.
  if (winkel > Math.PI / 4) winkel -= Math.PI / 2;
  if (winkel < -Math.PI / 4) winkel += Math.PI / 2;
  if (Math.abs(winkel) < (EINRASTEN / 180) * Math.PI) winkel = 0;
  const cos = Math.cos(winkel);
  const sin = Math.sin(winkel);

  // In das gedrehte Achsenkreuz; Ausmaße ohne die äußersten 3 % (Überschwinger am Zugende).
  const lokal = punkte.map((p) => ({
    u: (p.x - m.x) * cos + (p.y - m.y) * sin,
    v: -(p.x - m.x) * sin + (p.y - m.y) * cos,
  }));
  const quantil = (werte: number[], q: number) => {
    const s = [...werte].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
  };
  const us = lokal.map((p) => p.u);
  const vs = lokal.map((p) => p.v);
  const u0 = quantil(us, 0.03);
  const u1 = quantil(us, 0.97);
  const v0 = quantil(vs, 0.03);
  const v1 = quantil(vs, 0.97);
  const a = Math.max(4, (u1 - u0) / 2);
  const b = Math.max(4, (v1 - v0) / 2);
  const mu = (u0 + u1) / 2;
  const mv = (v0 + v1) / 2;

  // Wie gut passt Ellipse, wie gut Rechteck? Mittlere Abweichung vom Rand, normiert.
  let fehlerEllipse = 0;
  let fehlerRechteck = 0;
  for (const p of lokal) {
    const nu = (p.u - mu) / a;
    const nv = (p.v - mv) / b;
    fehlerEllipse += Math.abs(Math.hypot(nu, nv) - 1);
    fehlerRechteck += Math.abs(Math.max(Math.abs(nu), Math.abs(nv)) - 1);
  }
  fehlerEllipse /= lokal.length;
  fehlerRechteck /= lokal.length;
  // Kreise sind der Normalfall; ein Rechteck muss deutlich besser passen.
  const form: Form = fehlerRechteck < fehlerEllipse * 0.6 ? "rechteck" : "ellipse";

  const zurueck = (u: number, v: number): Punkt => {
    const uu = u + mu;
    const vv = v + mv;
    return { x: m.x + uu * cos - vv * sin, y: m.y + uu * sin + vv * cos };
  };

  // Beginn und Ende oben in der Mitte: Dort sitzt später der Zettel.
  const aus: Punkt[] = [];
  if (form === "ellipse") {
    for (let i = 0; i <= 64; i++) {
      const w = (i / 64) * Math.PI * 2 - Math.PI / 2;
      aus.push(zurueck(a * Math.cos(w), b * Math.sin(w)));
    }
  } else {
    const ecken = [
      [0, -b],
      [a, -b],
      [a, b],
      [-a, b],
      [-a, -b],
      [0, -b],
    ];
    for (let i = 0; i < ecken.length - 1; i++) {
      const [x0, y0] = ecken[i];
      const [x1, y1] = ecken[i + 1];
      for (let k = 0; k < 8; k++) aus.push(zurueck(x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8));
    }
    aus.push(zurueck(0, -b));
  }
  // Exakt geschlossen, sonst bliebe zwischen Anfang und Ende ein Rundungsspalt.
  aus[aus.length - 1] = { ...aus[0] };
  return { punkte: aus, form };
}
