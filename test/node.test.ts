import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { feedbackNodeHandler, standaloneSkript } from "../src/node/index.ts";

const leer = {
  liste: async () => [],
  anlegen: async () => {
    throw new Error("nicht gebraucht");
  },
  antworten: async () => {},
  erledigt: async () => {},
  loeschen: async () => {},
};

async function mitServer(handler: ReturnType<typeof feedbackNodeHandler>, lauf: (basis: string) => Promise<void>) {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((fertig) => server.listen(0, fertig));
  const adresse = server.address();
  const port = typeof adresse === "object" && adresse ? adresse.port : 0;
  try {
    await lauf(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("Node-Adapter: /status und Anmerkungen wie die Next-Route, Schalter aus sperrt", async () => {
  process.env.FEEDBACK = "1";
  await mitServer(feedbackNodeHandler({ speicher: { ...leer, status: async () => true } }), async (basis) => {
    assert.deepEqual(await (await fetch(`${basis}/api/feedback/status`)).json(), { an: true });
    const liste = await fetch(`${basis}/api/feedback/anmerkungen`, { headers: { "x-gcf-autor": "11111111-2222-3333-4444-555555555555" } });
    assert.equal(liste.status, 200);
    assert.deepEqual(await liste.json(), { anmerkungen: [] });
    // Ungültiger Body kommt als 400 zurück, nicht als 500: der Strom wurde gelesen.
    const falsch = await fetch(`${basis}/api/feedback/anmerkungen`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-gcf-autor": "11111111-2222-3333-4444-555555555555" },
      body: JSON.stringify({ path: "kein-pfad" }),
    });
    assert.equal(falsch.status, 400);
  });
  await mitServer(feedbackNodeHandler({ speicher: { ...leer, status: async () => false } }), async (basis) => {
    assert.deepEqual(await (await fetch(`${basis}/api/feedback/status`)).json(), { an: false });
    assert.equal((await fetch(`${basis}/api/feedback/anmerkungen`)).status, 404);
  });
});

test("die eigenständige Fassung liegt im Paket und enthält kein zod", async () => {
  const skript = await standaloneSkript();
  assert.ok(skript.length > 50_000);
  assert.ok(skript.length < 400_000, `zu groß: ${skript.length} Bytes`);
  assert.ok(skript.includes("GrowcoreFeedback"));
  assert.ok(!skript.includes("ZodError"), "zod ist ins Browser-Bündel gerutscht");
});
