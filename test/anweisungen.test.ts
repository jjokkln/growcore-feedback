import { test } from "node:test";
import assert from "node:assert/strict";
import { wissenFuerSammelstelle } from "../src/next/anweisungen.ts";

const basis = { produkt: "Website des Vereins X", wissen: "W", ziele: {} };

test("ohne Zusatzfelder gehen nur Produkt, Text und Ziele an die Sammelstelle", () => {
  assert.deepEqual(wissenFuerSammelstelle(basis), { produkt: "Website des Vereins X", text: "W", ziele: [] });
});

test("Ziele werden zur Liste, Zusatzfelder kommen mit, Längen sind begrenzt", () => {
  const w = wissenFuerSammelstelle({
    ...basis,
    wissen: "x".repeat(50_000),
    ziele: { "nav-team": { name: "Team", seite: "/team", selektoren: [{ css: "#t" }] }, kontakt: { name: "Kontakt" } },
    anrede: "du",
    ansprechpartner: "die Administration",
  });
  assert.equal(w.text.length, 40_000);
  assert.deepEqual(w.ziele, [{ id: "nav-team", name: "Team", seite: "/team" }, { id: "kontakt", name: "Kontakt" }]);
  assert.equal(w.anrede, "du");
  assert.equal(w.ansprechpartner, "die Administration");
  // Selektoren bleiben im Browser: Die KI bekommt nur Kennung und Namen.
  assert.ok(!JSON.stringify(w).includes("#t"));
});
