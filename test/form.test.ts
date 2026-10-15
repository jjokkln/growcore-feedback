import assert from "node:assert/strict";
import { test } from "node:test";

import { glaetteZug } from "../src/core/form.ts";

/** Ein gekritzelter Zug: Kurve plus Zittern, wie von Hand. */
function kritzel(f: (t: number) => { x: number; y: number }, n = 80, zittern = 4) {
  let s = 7;
  const zufall = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5) * 2 * zittern;
  return Array.from({ length: n }, (_, i) => {
    const p = f(i / (n - 1));
    return { x: p.x + zufall(), y: p.y + zufall() };
  });
}

test("Gekritzelter Kreis wird Ellipse um dieselbe Mitte, Zettelpunkt oben", () => {
  const zug = kritzel((t) => ({ x: 300 + 100 * Math.cos(t * 2.1 * Math.PI), y: 200 + 60 * Math.sin(t * 2.1 * Math.PI) }));
  const g = glaetteZug(zug);
  assert.ok(g);
  assert.equal(g.form, "ellipse");
  const xs = g.punkte.map((p) => p.x);
  const ys = g.punkte.map((p) => p.y);
  assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 300) < 10);
  assert.ok(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - 200) < 10);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) / 2 - 100) < 15);
  assert.ok(Math.abs((Math.max(...ys) - Math.min(...ys)) / 2 - 60) < 12);
  // Erster und letzter Punkt oben in der Mitte (dort hängt der Zettel).
  assert.deepEqual(g.punkte[0], g.punkte[g.punkte.length - 1]);
  assert.ok(g.punkte[0].y < 200 - 40);
});

test("Gezeichnetes Rechteck bleibt eckig", () => {
  const ecken = [
    [100, 100],
    [400, 100],
    [400, 250],
    [100, 250],
    [100, 100],
  ];
  const zug = kritzel((t) => {
    const s = Math.min(3.999, t * 4);
    const i = Math.floor(s);
    const f = s - i;
    return { x: ecken[i][0] + (ecken[i + 1][0] - ecken[i][0]) * f, y: ecken[i][1] + (ecken[i + 1][1] - ecken[i][1]) * f };
  }, 120, 3);
  const g = glaetteZug(zug);
  assert.ok(g);
  assert.equal(g.form, "rechteck");
  const xs = g.punkte.map((p) => p.x);
  assert.ok(Math.abs(Math.min(...xs) - 100) < 15 && Math.abs(Math.max(...xs) - 400) < 15);
});

test("Schräge Ellipse bleibt schräg", () => {
  const w = Math.PI / 6;
  const zug = kritzel((t) => {
    const u = 120 * Math.cos(t * 2 * Math.PI);
    const v = 40 * Math.sin(t * 2 * Math.PI);
    return { x: 300 + u * Math.cos(w) - v * Math.sin(w), y: 300 + u * Math.sin(w) + v * Math.cos(w) };
  }, 90, 2);
  const g = glaetteZug(zug);
  assert.ok(g);
  // Der Punkt mit der größten x-Ausdehnung liegt deutlich unterhalb der Mitte (Drehung um +30°).
  const rechts = g.punkte.reduce((a, b) => (b.x > a.x ? b : a));
  assert.ok(rechts.y > 330);
});

test("Offener Strich und zu Kleines bleiben Freihand", () => {
  assert.equal(glaetteZug(kritzel((t) => ({ x: 100 + 300 * t, y: 200 + 10 * Math.sin(t * 6) }), 60, 1)), null);
  assert.equal(glaetteZug(kritzel((t) => ({ x: 100 + 8 * Math.cos(t * 6.3), y: 100 + 8 * Math.sin(t * 6.3) }), 30, 0.5)), null);
  assert.equal(glaetteZug([{ x: 0, y: 0 }, { x: 50, y: 50 }]), null);
});
