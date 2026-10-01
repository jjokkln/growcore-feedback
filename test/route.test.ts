import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { feedbackRoute } from "../src/next/route.ts";
import { leseAntwort } from "../src/core/ki-antwort.ts";

const REF = "11111111-2222-3333-4444-555555555555";
const FREMD = "99999999-8888-7777-6666-555555555555";
const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const zeile = (author_ref: string | null, from_agency = false) => ({
  id: ID,
  path: "/",
  shape: "pin",
  kind: from_agency ? "question" : "note",
  body: "Text",
  anchor_selector: "#start",
  anchor_label: "Start",
  points: [{ x: 0.5, y: 0.5 }],
  fallback: [{ x: 0.1, y: 0.1 }],
  color: "rot",
  viewport_width: 1200,
  from_agency,
  author_label: "Nadine",
  author_ref,
  done: false,
  created_at: "2026-09-28T10:00:00Z",
  replies: [{ id: "r1", body: "Antwort", from_agency: false, author_label: "Nadine", author_ref: REF, created_at: "2026-09-28T10:01:00Z" }],
});

let aufrufe: Array<{ url: string; init: RequestInit }> = [];
let antwortVomEingang: () => Response;
/** Der Schalter der Sammelstelle (0.7.0) — getrennt gezählt, `aufrufe` bleibt bei den Daten. */
let statusVomEingang: () => Response;
let statusAufrufe = 0;
const echtesFetch = globalThis.fetch;

beforeEach(() => {
  process.env.FEEDBACK = "1";
  process.env.GROWCORE_FEEDBACK_KEY = "gcf_test";
  aufrufe = [];
  statusAufrufe = 0;
  antwortVomEingang = () => Response.json({ anmerkungen: [zeile(REF), zeile(FREMD), zeile(null, true)] });
  statusVomEingang = () => Response.json({ an: true });
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/api/feedback/status")) {
      statusAufrufe++;
      return statusVomEingang();
    }
    aufrufe.push({ url: String(url), init });
    return antwortVomEingang();
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = echtesFetch;
});

const anfrage = (pfad: string, init: RequestInit & { ref?: string | null } = {}) => {
  const headers = new Headers(init.headers);
  if (init.ref !== null) headers.set("x-gcf-autor", init.ref ?? REF);
  headers.set("x-forwarded-for", `10.0.0.${Math.floor(Math.random() * 250)}`);
  return new Request(`https://kunde.test/api/feedback${pfad}`, { ...init, headers });
};

test("ohne FEEDBACK=1 gibt es die Route nicht", async () => {
  process.env.FEEDBACK = "";
  const { GET } = feedbackRoute();
  assert.equal((await GET(anfrage("/anmerkungen"))).status, 404);
  assert.equal(aufrufe.length, 0);
});

test("GET: author_ref verlässt den Server nie, eigen stimmt", async () => {
  const { GET } = feedbackRoute();
  const antwort = await GET(anfrage("/anmerkungen"));
  const text = await antwort.text();
  assert.ok(!text.includes(REF) && !text.includes(FREMD), "Kennungen dürfen nicht im Browser landen");
  assert.ok(!text.includes("author_ref"));
  const { anmerkungen } = JSON.parse(text);
  assert.deepEqual(anmerkungen.map((a: { eigen: boolean }) => a.eigen), [true, false, false]);
  assert.equal(aufrufe[0]?.url, "https://www.lennys-projekte.de/api/feedback/anmerkungen");
  assert.equal(new Headers(aufrufe[0]?.init.headers).get("authorization"), "Bearer gcf_test");
});

test("POST ohne Kennung wird abgewiesen, ohne den Eingang zu fragen", async () => {
  const { POST } = feedbackRoute();
  const antwort = await POST(anfrage("/anmerkungen", { method: "POST", body: "{}", ref: null }));
  assert.equal(antwort.status, 400);
  assert.equal(aufrufe.length, 0);
});

test("POST mit ungültiger Anmerkung kommt nicht beim Eingang an", async () => {
  const { POST } = feedbackRoute();
  const antwort = await POST(anfrage("/anmerkungen", { method: "POST", body: JSON.stringify({ path: "/", shape: "pin" }) }));
  assert.equal(antwort.status, 400);
  assert.equal(aufrufe.length, 0);
});

test("POST gültig: Autor aus den Kopfzeilen, Farbe blau ist nicht wählbar", async () => {
  antwortVomEingang = () => Response.json({ anmerkung: zeile(REF) }, { status: 201 });
  const { POST } = feedbackRoute();
  const koerper = {
    path: "/partner",
    shape: "pin",
    body: "Bitte ändern",
    anchor_selector: "#justiz",
    anchor_label: "Justiz",
    points: [{ x: 0.2, y: 0.3 }],
    fallback: [{ x: 0.1, y: 0.2 }],
    color: "rot",
    viewport_width: 390,
  };
  const ok = await POST(
    anfrage("/anmerkungen", {
      method: "POST",
      body: JSON.stringify(koerper),
      headers: { "x-gcf-name": encodeURIComponent("Nadine P.") },
    }),
  );
  assert.equal(ok.status, 201);
  const gesendet = JSON.parse(String(aufrufe[0]?.init.body));
  assert.deepEqual(gesendet.author, { label: "Nadine P.", ref: REF });
  assert.ok(!(await ok.text()).includes(REF));

  const blau = await POST(anfrage("/anmerkungen", { method: "POST", body: JSON.stringify({ ...koerper, color: "blau" }) }));
  assert.equal(blau.status, 400);
});

test("DELETE und PATCH nur mit gültiger Id", async () => {
  const { DELETE, PATCH } = feedbackRoute();
  assert.equal((await DELETE(anfrage("/anmerkungen/../../x", { method: "DELETE" }))).status, 404);
  assert.equal((await PATCH(anfrage("/anmerkungen/keine-uuid", { method: "PATCH", body: '{"done":true}' }))).status, 404);
  antwortVomEingang = () => Response.json({ ok: true });
  assert.equal((await DELETE(anfrage(`/anmerkungen/${ID}`, { method: "DELETE" }))).status, 200);
  assert.equal(aufrufe.at(-1)?.url, `https://www.lennys-projekte.de/api/feedback/anmerkungen/${ID}`);
});

test("Fehler des Eingangs: 403 bleibt 403, falscher Schlüssel wird 503 ohne Details", async () => {
  const { DELETE, GET } = feedbackRoute();
  antwortVomEingang = () => Response.json({ fehler: "Nur eigene Anmerkungen lassen sich löschen." }, { status: 403 });
  const verboten = await DELETE(anfrage(`/anmerkungen/${ID}`, { method: "DELETE" }));
  assert.equal(verboten.status, 403);
  antwortVomEingang = () => Response.json({ fehler: "Schlüssel ungültig." }, { status: 401 });
  const schluessel = await GET(anfrage("/anmerkungen"));
  assert.equal(schluessel.status, 503);
  assert.ok(!(await schluessel.text()).includes("Schlüssel ungültig"));
});

test("KI-Hilfe: aus ohne KI_HILFE=1, und ohne Meldung an den Eingang keine Frage an Gemini", async () => {
  const ki = { produkt: "Testseite", wissen: "Nichts.", ziele: {} };
  const { POST } = feedbackRoute({ ki });
  const koerper = JSON.stringify({ seite: "/", nachrichten: [{ rolle: "nutzer", text: "Hallo?" }] });
  process.env.KI_HILFE = "";
  assert.equal((await POST(anfrage("/ki-hilfe", { method: "POST", body: koerper }))).status, 503);

  process.env.KI_HILFE = "1";
  antwortVomEingang = () => Response.json({ fehler: "zu viel" }, { status: 429 });
  const gebremst = await POST(anfrage("/ki-hilfe", { method: "POST", body: koerper }));
  assert.equal(gebremst.status, 429);
  assert.equal(aufrufe.length, 1);
  assert.ok(aufrufe[0]?.url.endsWith("/api/feedback/ki-fragen"));
});

test("Antwortparser: unbekannte Ziele fallen weg, halbe Marken blitzen nicht auf", () => {
  const a = leseAntwort("So geht es.\n1. Oben „Spenden\" [ziel:spenden]\n2. Dann weiter [ziel:erfunden]\n3. Halb [zi", (id) => id === "spenden");
  assert.equal(a.einleitung, "So geht es.");
  assert.deepEqual(a.schritte.map((s) => s.ziel), ["spenden", null, null]);
  assert.equal(a.schritte[2]?.text, "Halb");
});

// ─── Fernschalter (0.7.0) ───────────────────────────────────────────────────

test("Schalter an: /status sagt an, der Rest läuft wie bisher", async () => {
  const { GET } = feedbackRoute();
  const antwort = await GET(anfrage("/status", { ref: null }));
  assert.equal(antwort.status, 200);
  assert.deepEqual(await antwort.json(), { an: true });
  assert.equal((await GET(anfrage("/anmerkungen"))).status, 200);
  // 30 s gemerkt: zweimal gefragt, einmal bei der Sammelstelle.
  assert.equal(statusAufrufe, 1);
});

test("Schalter aus: /status sagt aus, alle anderen Pfade 404, kein Datenaufruf", async () => {
  statusVomEingang = () => Response.json({ an: false });
  const { GET, POST } = feedbackRoute();
  assert.deepEqual(await (await GET(anfrage("/status", { ref: null }))).json(), { an: false });
  assert.equal((await GET(anfrage("/anmerkungen"))).status, 404);
  const neu = { path: "/", shape: "pin", body: "x", anchor_selector: "#a", anchor_label: "A", points: [{ x: 0, y: 0 }], fallback: [{ x: 0, y: 0 }], color: "rot" };
  assert.equal((await POST(anfrage("/anmerkungen", { method: "POST", body: JSON.stringify(neu) }))).status, 404);
  assert.equal(aufrufe.length, 0);
});

test("Sammelstelle ohne Schalter (404) gilt als an, nicht erreichbar oder abgewiesen als aus", async () => {
  statusVomEingang = () => Response.json({ fehler: "Nicht gefunden." }, { status: 404 });
  assert.deepEqual(await (await feedbackRoute().GET(anfrage("/status", { ref: null }))).json(), { an: true });

  statusVomEingang = () => Response.json({ fehler: "Schlüssel ungültig." }, { status: 401 });
  assert.deepEqual(await (await feedbackRoute().GET(anfrage("/status", { ref: null }))).json(), { an: false });

  statusVomEingang = () => {
    throw new TypeError("fetch failed");
  };
  assert.deepEqual(await (await feedbackRoute().GET(anfrage("/status", { ref: null }))).json(), { an: false });
});

test("ohne Schlüssel ist das Werkzeug aus, ohne die Sammelstelle zu fragen", async () => {
  process.env.GROWCORE_FEEDBACK_KEY = "";
  assert.deepEqual(await (await feedbackRoute().GET(anfrage("/status", { ref: null }))).json(), { an: false });
  assert.equal(statusAufrufe, 0);
});

test("eigener Speicher ohne status(): an; mit status(): dessen Antwort", async () => {
  const leer = { liste: async () => [], anlegen: async () => { throw new Error(); }, antworten: async () => {}, erledigt: async () => {}, loeschen: async () => {} };
  assert.deepEqual(await (await feedbackRoute({ speicher: leer }).GET(anfrage("/status", { ref: null }))).json(), { an: true });
  const aus = { ...leer, status: async () => false };
  const route = feedbackRoute({ speicher: aus });
  assert.deepEqual(await (await route.GET(anfrage("/status", { ref: null }))).json(), { an: false });
  assert.equal((await route.GET(anfrage("/anmerkungen"))).status, 404);
});

test("ohne FEEDBACK=1 gibt es auch /status nicht", async () => {
  process.env.FEEDBACK = "";
  assert.equal((await feedbackRoute().GET(anfrage("/status", { ref: null }))).status, 404);
  assert.equal(statusAufrufe, 0);
});
