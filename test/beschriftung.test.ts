import assert from "node:assert/strict";
import { test } from "node:test";

import { agenturArt, vorname } from "../src/core/konstanten.ts";

test("Agentur-Beschriftung nennt den Vornamen aus dem Zugang (0.16.6)", () => {
  assert.equal(vorname("Lenny (Lenny Helps)"), "Lenny");
  assert.equal(vorname("Max Muster (Galdora)"), "Max");
  assert.equal(vorname("  "), null);
  assert.equal(vorname(null), null);
  assert.equal(agenturArt("question", "Max (Galdora)"), "Frage von Max");
  assert.equal(agenturArt("hint", null), "Hinweis von Lenny");
  assert.equal(agenturArt("changed", "Max (Galdora)"), "Geändert – bitte prüfen");
});
