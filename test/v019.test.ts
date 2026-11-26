import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { feedbackRoute } from "../src/next/route.ts";
import type { FeedbackSpeicher } from "../src/next/speicher.ts";

// Neu in 0.19.0: Punktmarken nachträglich verschieben (PATCH mit `lage`).

const REF = "11111111-2222-3333-4444-555555555555";
const ID = "cb987ad9-daf1-45f6-a591-95cf67e7e06a";

let aufrufe: Array<{ url: string; init: RequestInit }> = [];
let statusVomEingang: () => Response;
const echtesFetch = globalThis.fetch;

beforeEach(() => {
  process.env.FEEDBACK = "1";
  process.env.GROWCORE_FEEDBACK_KEY = "gcf_test";
  aufrufe = [];
  statusVomEingang = () => Response.json({ an: true, verschieben: true });
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/api/feedback/status")) return statusVomEingang();
    aufrufe.push({ url: String(url), init });
    return Response.json({ ok: true });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = echtesFetch;
});

const anfrage = (pfad: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("x-gcf-autor", REF);
  headers.set("x-forwarded-for", `10.2.0.${Math.floor(Math.random() * 250)}`);
  return new Request(`https://kunde.test/api/feedback${pfad}`, { ...init, headers });
};
const lage = {
  anchor_selector: "#preise",
  anchor_label: "Preise → Paket M",
  points: [{ x: 0.3, y: 0.6 }],
  fallback: [{ x: 0.2, y: 0.4 }],
};
const patch = (body: unknown) => anfrage(`/anmerkungen/${ID}`, { method: "PATCH", body: JSON.stringify(body) });

test("Status meldet verschieben nur, wenn die Sammelstelle es kann", async () => {
  assert.equal((await (await feedbackRoute().GET(anfrage("/status"))).json()).verschieben, true);
  statusVomEingang = () => Response.json({ an: true });
  assert.equal((await (await feedbackRoute().GET(anfrage("/status"))).json()).verschieben, false);
});

test("PATCH mit lage geht mit Autor an den Eingang", async () => {
  const antwort = await feedbackRoute().PATCH(patch({ lage }));
  assert.equal(antwort.status, 200);
  assert.equal(aufrufe.length, 1);
  assert.match(aufrufe[0].url, new RegExp(`/anmerkungen/${ID}$`));
  assert.equal(aufrufe[0].init.method, "PATCH");
  const body = JSON.parse(String(aufrufe[0].init.body));
  assert.deepEqual(body.lage, lage);
  assert.equal(body.author.ref, REF);
  assert.equal("done" in body, false);
});

test("PATCH mit lage an einer Sammelstelle ohne Verschieben: 501, nichts gesendet", async () => {
  statusVomEingang = () => Response.json({ an: true });
  assert.equal((await feedbackRoute().PATCH(patch({ lage }))).status, 501);
  assert.equal(aufrufe.length, 0);
});

test("Eigener Speicher ohne verschieben: 501", async () => {
  const leer: FeedbackSpeicher = {
    liste: async () => [],
    anlegen: async () => {
      throw new Error("nicht gebraucht");
    },
    antworten: async () => {},
    erledigt: async () => {},
    loeschen: async () => {},
    status: async () => ({ an: true, verschieben: true }),
  };
  assert.equal((await feedbackRoute({ speicher: leer }).PATCH(patch({ lage }))).status, 501);
});

test("Ungültige lage fällt nicht auf erledigt zurück", async () => {
  assert.equal((await feedbackRoute().PATCH(patch({ lage: { ...lage, points: [] } }))).status, 400);
  assert.equal((await feedbackRoute().PATCH(patch({ lage: { ...lage, points: [lage.points[0], lage.points[0]], fallback: lage.fallback } }))).status, 400);
  assert.equal(aufrufe.length, 0);
});

test("PATCH done läuft weiter wie bisher", async () => {
  assert.equal((await feedbackRoute().PATCH(patch({ done: true }))).status, 200);
  assert.deepEqual(JSON.parse(String(aufrufe[0].init.body)).done, true);
});
