import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { leseEreignis } from "../src/core/assistent.ts";
import { istKnapp } from "../src/core/nachfrage.ts";
import { neueAnmerkungSchema } from "../src/core/typen.ts";
import { feedbackRoute } from "../src/next/route.ts";
import type { FeedbackSpeicher } from "../src/next/speicher.ts";
import { browserName, geraetArt, osName } from "../src/react/umgebung.ts";

// Neu in 0.17.0: Daumen, Umgebung, Bild, Nachfrage, Kennung erst beim Schreiben (client.ts braucht den Browser, getestet im Harness).

const REF = "11111111-2222-3333-4444-555555555555";
const FRAGE = "cb987ad9-daf1-45f6-a591-95cf67e7e06a";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

let aufrufe: Array<{ url: string; init: RequestInit }> = [];
let statusVomEingang: () => Response;
let antwortVomEingang: () => Response;
const echtesFetch = globalThis.fetch;

beforeEach(() => {
  process.env.FEEDBACK = "1";
  process.env.KI_HILFE = "1";
  delete process.env.FEEDBACK_BILD;
  process.env.GROWCORE_FEEDBACK_KEY = "gcf_test";
  aufrufe = [];
  statusVomEingang = () => Response.json({ an: true, assistent: true, ideen: true, bild: true, nachfrage: true });
  antwortVomEingang = () => Response.json({ ok: true });
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/api/feedback/status")) return statusVomEingang();
    aufrufe.push({ url: String(url), init });
    return antwortVomEingang();
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = echtesFetch;
  process.env.KI_HILFE = "";
});

const anfrage = (pfad: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("x-gcf-autor", REF);
  headers.set("x-forwarded-for", `10.1.0.${Math.floor(Math.random() * 250)}`);
  return new Request(`https://kunde.test/api/feedback${pfad}`, { ...init, headers });
};
const ki = { produkt: "Testseite", wissen: "Nichts.", ziele: {} };
const umgebung = { host: "kunde.test", geraet: "handy", browser: "Safari 18", os: "iOS", viewport_width: 390, viewport_height: 780, pixel_ratio: 3, farbmodus: "hell" };
const neu = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    path: "/",
    shape: "pin",
    body: "Bitte das Bild tauschen, es ist zu dunkel",
    anchor_selector: "#start",
    anchor_label: "Start",
    points: [{ x: 0.5, y: 0.5 }],
    fallback: [{ x: 0.1, y: 0.1 }],
    color: "rot",
    viewport_width: 390,
    ...extra,
  });
const gesendet = () => JSON.parse(String(aufrufe.at(-1)?.init.body)) as Record<string, unknown>;

test("ende-Ereignis trägt die Frage-Kennung, eine kaputte fällt weg", () => {
  assert.deepEqual(leseEreignis(`{"typ":"ende","text":"x","frage_id":"${FRAGE}"}`), { typ: "ende", text: "x", frage_id: FRAGE });
  assert.deepEqual(leseEreignis('{"typ":"ende","text":"x","frage_id":"nicht-gültig"}'), { typ: "ende", text: "x" });
  assert.deepEqual(leseEreignis('{"typ":"ende","text":"x"}'), { typ: "ende", text: "x" });
});

test("knapp ist, was ohne Rückfrage schwer umzusetzen wäre", () => {
  for (const t of ["", "  ", "löschen", "bild wechsel", "Überschrift verändern bitte", "Hier das Foto"]) assert.ok(istKnapp(t), t);
  assert.ok(istKnapp(null));
  assert.ok(!istKnapp("Das Foto ganz oben soll durch das vom Sommerfest ersetzt werden"));
  assert.ok(!istKnapp("Bitte die Telefonnummer im Fuß ändern"));
});

test("Umgebung: Browser, System und Gerät aus dem User-Agent", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  assert.equal(browserName(iphone), "Safari 18");
  assert.equal(osName(iphone, 5), "iOS");
  assert.equal(geraetArt(iphone, "iOS"), "handy");
  const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.46";
  assert.equal(browserName(edge), "Edge 130");
  assert.equal(geraetArt(edge, osName(edge, 0)), "desktop");
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  assert.equal(osName(mac, 0), "macOS");
  assert.equal(osName(mac, 5), "iPadOS", "ein iPad meldet sich als Mac, mit Touch");
  assert.equal(geraetArt(mac, "iPadOS"), "tablet");
  const pixel = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
  assert.equal(geraetArt(pixel, osName(pixel, 5)), "handy");
  assert.equal(browserName(pixel), "Chrome 131");
});

test("Schema: Umgebung und Bild sind optional, ein PNG oder ein zu großes Bild nicht", () => {
  const kern = JSON.parse(neu());
  assert.ok(neueAnmerkungSchema.safeParse(kern).success);
  assert.ok(neueAnmerkungSchema.safeParse({ ...kern, umgebung, screenshot: JPEG }).success);
  assert.ok(!neueAnmerkungSchema.safeParse({ ...kern, screenshot: "data:image/png;base64,AAAA" }).success);
  assert.ok(!neueAnmerkungSchema.safeParse({ ...kern, screenshot: `data:image/jpeg;base64,${"A".repeat(830_000)}` }).success);
  assert.ok(!neueAnmerkungSchema.safeParse({ ...kern, umgebung: { ...umgebung, geraet: "fernseher" } }).success);
});

test("Status meldet Bild und Nachfrage nur, wenn Sammelstelle und App es wollen", async () => {
  const route = () => feedbackRoute({ ki });
  const sage = async (r: ReturnType<typeof feedbackRoute>) => (await (await r.GET(anfrage("/status"))).json()) as Record<string, unknown>;
  assert.deepEqual(await sage(route()), { an: true, assistent: true, ideen: true, bild: true, nachfrage: true });

  process.env.FEEDBACK_BILD = "0";
  assert.equal((await sage(route())).bild, false, "FEEDBACK_BILD=0 stellt das Bild in dieser App ab");
  delete process.env.FEEDBACK_BILD;

  process.env.KI_HILFE = "";
  assert.equal((await sage(route())).nachfrage, false, "die Nachfrage ist KI und braucht KI_HILFE=1");
  process.env.KI_HILFE = "1";

  statusVomEingang = () => Response.json({ an: true, assistent: true, ideen: true });
  const alt = await sage(route());
  assert.equal(alt.bild, false, "ältere Sammelstelle: Funktion still aus");
  assert.equal(alt.nachfrage, false);
});

test("Anmerkung: Umgebung und Bild gehen an die Sammelstelle, das Bild nur bei „bild an“", async () => {
  antwortVomEingang = () => Response.json({ anmerkung: { id: FRAGE, replies: [] } }, { status: 201 });
  const { POST } = feedbackRoute({ ki });
  assert.equal((await POST(anfrage("/anmerkungen", { method: "POST", body: neu({ umgebung, screenshot: JPEG }) }))).status, 201);
  assert.deepEqual(gesendet().umgebung, umgebung);
  assert.equal(gesendet().screenshot, JPEG);

  statusVomEingang = () => Response.json({ an: true, assistent: true, ideen: true, bild: false });
  const ohneBild = feedbackRoute({ ki });
  assert.equal((await ohneBild.POST(anfrage("/anmerkungen", { method: "POST", body: neu({ umgebung, screenshot: JPEG }) }))).status, 201);
  assert.deepEqual(gesendet().umgebung, umgebung);
  assert.equal(gesendet().screenshot, undefined, "Sammelstelle sagt kein Bild: das Bild wird nicht weitergereicht");

  assert.equal((await POST(anfrage("/anmerkungen", { method: "POST", body: neu({ screenshot: "data:text/html;base64,AAAA" }) }))).status, 400);
});

test("Eigener Speicher ohne `erweitert` bekommt weder Umgebung noch Bild", async () => {
  let angelegt: Record<string, unknown> | null = null;
  const speicher: FeedbackSpeicher = {
    liste: async () => [],
    anlegen: async (n) => {
      angelegt = n as unknown as Record<string, unknown>;
      throw new Error("nicht weiter");
    },
    antworten: async () => {},
    erledigt: async () => {},
    loeschen: async () => {},
    status: async () => ({ an: true, bild: true }),
  };
  const route = feedbackRoute({ speicher });
  await route.POST(anfrage("/anmerkungen", { method: "POST", body: neu({ umgebung, screenshot: JPEG }) }));
  assert.ok(angelegt, "anlegen wurde aufgerufen");
  assert.equal((angelegt as Record<string, unknown>).umgebung, undefined);
  assert.equal((angelegt as Record<string, unknown>).screenshot, undefined);
  assert.equal(((await (await route.GET(anfrage("/status"))).json()) as { bild: boolean }).bild, false);
});

test("Daumen: geht mit Autor an die Sammelstelle, Ungültiges nicht, ohne Assistent 404", async () => {
  const { POST } = feedbackRoute({ ki });
  assert.equal((await POST(anfrage("/ki-bewertung", { method: "POST", body: JSON.stringify({ frage_id: FRAGE, wert: 1 }) }))).status, 200);
  assert.ok(aufrufe.at(-1)?.url.endsWith("/api/feedback/ki-bewertung"));
  assert.deepEqual(gesendet(), { frage_id: FRAGE, wert: 1, author: { label: "Gast", ref: REF } });
  const vorher = aufrufe.length;
  for (const roh of [{ frage_id: "x", wert: 1 }, { frage_id: FRAGE, wert: 5 }, { frage_id: FRAGE }]) {
    assert.equal((await POST(anfrage("/ki-bewertung", { method: "POST", body: JSON.stringify(roh) }))).status, 400);
  }
  assert.equal(aufrufe.length, vorher);

  statusVomEingang = () => Response.json({ an: true });
  const ohne = feedbackRoute({ ki });
  assert.equal((await ohne.POST(anfrage("/ki-bewertung", { method: "POST", body: JSON.stringify({ frage_id: FRAGE, wert: -1 }) }))).status, 404);
});

test("Nachfrage: höchstens zwei Fragen, nur mit KI_HILFE und Sammelstelle, Fehler ergeben keine Fragen", async () => {
  const koerper = JSON.stringify({ text: "bild wechsel", seite: "/", stelle: "Start" });
  antwortVomEingang = () => Response.json({ fragen: ["Welches Bild?", "Wodurch ersetzen?"] });
  const route = feedbackRoute({ ki });
  const antwort = await route.POST(anfrage("/nachfrage", { method: "POST", body: koerper }));
  assert.equal(antwort.status, 200);
  assert.deepEqual(await antwort.json(), { fragen: ["Welches Bild?", "Wodurch ersetzen?"] });
  assert.ok(aufrufe.at(-1)?.url.endsWith("/api/feedback/nachfrage"));
  assert.deepEqual(gesendet(), { text: "bild wechsel", seite: "/", stelle: "Start" });

  antwortVomEingang = () => Response.json({ fragen: ["a", "b", "c"] });
  assert.deepEqual(await (await route.POST(anfrage("/nachfrage", { method: "POST", body: koerper }))).json(), { fragen: [] }, "mehr als zwei ist keine Rückfrage");
  antwortVomEingang = () => Response.json({ unfug: true });
  assert.deepEqual(await (await route.POST(anfrage("/nachfrage", { method: "POST", body: koerper }))).json(), { fragen: [] });

  assert.equal((await route.POST(anfrage("/nachfrage", { method: "POST", body: JSON.stringify({ text: "x" }) }))).status, 400);

  process.env.KI_HILFE = "";
  assert.equal((await feedbackRoute({ ki }).POST(anfrage("/nachfrage", { method: "POST", body: koerper }))).status, 404);
  process.env.KI_HILFE = "1";
  statusVomEingang = () => Response.json({ an: true, assistent: true, ideen: true });
  assert.equal((await feedbackRoute({ ki }).POST(anfrage("/nachfrage", { method: "POST", body: koerper }))).status, 404);
});
