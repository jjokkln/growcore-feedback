import { test } from "node:test";
import assert from "node:assert/strict";
import { systemAnweisung } from "../src/next/anweisungen.ts";

const basis = { produkt: "Website des Vereins X", wissen: "W", ziele: {} };

test("ohne neue Felder bleibt die Fassung für Websites (abwärtskompatibel)", () => {
  const s = systemAnweisung(basis, "/");
  assert.match(s, /Deine Aufgabe: erklären, was auf dieser Website steht/);
  assert.match(s, /sich direkt an den Verein zu wenden\./);
  assert.match(s, /Sprich die Person mit „Sie" an\./);
});

test("Anwendung: eigene Aufgabe, Ansprechpartner und Du", () => {
  const s = systemAnweisung(
    { ...basis, produkt: "Anwendung Y", aufgabe: "erklären, wie man die Anwendung bedient", ansprechpartner: "die Administration", anrede: "du" },
    "/team",
  );
  assert.match(s, /Deine Aufgabe: erklären, wie man die Anwendung bedient\. Nicht mehr\./);
  assert.match(s, /sich direkt an die Administration zu wenden\./);
  assert.match(s, /Duze die Person\./);
  assert.doesNotMatch(s, /Website|Verein|„Sie"/);
});
