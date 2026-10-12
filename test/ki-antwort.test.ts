import { test } from "node:test";
import assert from "node:assert/strict";
import { leseAntwort } from "../src/core/ki-antwort.ts";

const bekannt = (id: string) => ["nav-team", "reiter-mitarbeiter"].includes(id);

test("Marke mit ziel: wird gelesen und entfernt", () => {
  const a = leseAntwort("Satz.\n1. Klicke auf „Team“. [ziel:nav-team]", bekannt);
  assert.deepEqual(a.schritte, [{ nr: 1, text: "Klicke auf „Team“.", ziel: "nav-team" }]);
});

test("nackte Klammer mit bekannter Kennung zählt als Marke", () => {
  const a = leseAntwort("Satz.\n1. Klicke auf „Team“. [nav-team]\n2. Reiter „Mitarbeiter“. [REITER-MITARBEITER]", bekannt);
  assert.deepEqual(a.schritte.map((s) => [s.text, s.ziel]), [
    ["Klicke auf „Team“.", "nav-team"],
    ["Reiter „Mitarbeiter“.", "reiter-mitarbeiter"],
  ]);
});

test("andere Klammertexte bleiben stehen, unbekannte ziel:-Marken fallen weg", () => {
  const a = leseAntwort("Satz.\n1. Feld [optional] ausfüllen. [ziel:gibts-nicht]\n2. Weiter [x1]", bekannt);
  assert.deepEqual(a.schritte.map((s) => [s.text, s.ziel]), [
    ["Feld [optional] ausfüllen.", null],
    ["Weiter [x1]", null],
  ]);
});
