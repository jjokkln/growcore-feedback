import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { ankerLabel, stellenLabel } from "../src/core/anker.ts";
import { feedbackRoute } from "../src/next/route.ts";
import { EingangFehler } from "../src/next/eingang.ts";
import type { FeedbackSpeicher, Zeile } from "../src/next/speicher.ts";

const ICH = { ref: "user-aaaaaaaa-1111", label: "Team Person" };
const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const zeile = (author_ref: string): Zeile => ({
  id: ID,
  path: "/bewerber/1",
  shape: "pin",
  kind: "note",
  body: "Text",
  anchor_selector: "#start",
  anchor_label: "Start",
  points: [{ x: 0.5, y: 0.5 }],
  fallback: [{ x: 0.1, y: 0.1 }],
  color: "rot",
  viewport_width: 1200,
  from_agency: false,
  author_label: "Team Person",
  author_ref,
  done: false,
  created_at: "2026-09-29T10:00:00Z",
  replies: [],
});

let aufrufe: string[] = [];
let speicher: FeedbackSpeicher;
let angemeldet: typeof ICH | null;
let fetchAufrufe = 0;
const echtesFetch = globalThis.fetch;

beforeEach(() => {
  process.env.FEEDBACK = "1";
  delete process.env.GROWCORE_FEEDBACK_KEY;
  aufrufe = [];
  angemeldet = ICH;
  fetchAufrufe = 0;
  globalThis.fetch = (async () => {
    fetchAufrufe += 1;
    return Response.json({});
  }) as typeof fetch;
  speicher = {
    liste: async () => (aufrufe.push("liste"), [zeile(ICH.ref), zeile("fremd-1234567890")]),
    anlegen: async (neu, autor) => (aufrufe.push(`anlegen:${autor.ref}`), zeile(autor.ref)),
    antworten: async (id) => void aufrufe.push(`antworten:${id}`),
    erledigt: async (id, done) => void aufrufe.push(`erledigt:${id}:${done}`),
    loeschen: async (id) => {
      aufrufe.push(`loeschen:${id}`);
      throw new EingangFehler(403, "Nur eigene Anmerkungen.");
    },
  };
});

const route = () => feedbackRoute({ speicher, identitaet: async () => angemeldet });
const req = (methode: string, pfad: string, body?: unknown) =>
  new Request(`https://x.test/api/feedback${pfad}`, {
    method: methode,
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const NEU = {
  path: "/bewerber/1",
  shape: "pin",
  body: "Hier fehlt ein Filter",
  anchor_selector: "#start",
  anchor_label: "Start",
  points: [{ x: 0.5, y: 0.5 }],
  fallback: [{ x: 0.1, y: 0.1 }],
  color: "rot",
  viewport_width: 1200,
};

test("ohne Sitzung 401 auf jeder Route, der Speicher wird nicht berührt", async () => {
  angemeldet = null;
  const { GET, POST } = route();
  assert.equal((await GET(req("GET", "/anmerkungen"))).status, 401);
  assert.equal((await POST(req("POST", "/anmerkungen", NEU))).status, 401);
  assert.equal((await POST(req("POST", "/ki-hilfe", { seite: "/", nachrichten: [] }))).status, 401);
  assert.deepEqual(aufrufe, []);
});

test("Lesen: alle sehen alles, `eigen` folgt der Sitzung, Kennung geht nicht zum Browser", async () => {
  const { GET } = route();
  const antwort = await GET(req("GET", "/anmerkungen"));
  const { anmerkungen } = (await antwort.json()) as { anmerkungen: Array<Record<string, unknown>> };
  assert.equal(anmerkungen.length, 2);
  assert.deepEqual(anmerkungen.map((a) => a.eigen), [true, false]);
  assert.ok(anmerkungen.every((a) => !("author_ref" in a)));
});

test("Anlegen nimmt die Kennung aus der Sitzung, nie aus den Kopfzeilen", async () => {
  const { POST } = route();
  const r = new Request("https://x.test/api/feedback/anmerkungen", {
    method: "POST",
    headers: { "content-type": "application/json", "x-gcf-autor": "erfundene-kennung-999", "x-gcf-name": "Chef" },
    body: JSON.stringify(NEU),
  });
  assert.equal((await POST(r)).status, 201);
  assert.deepEqual(aufrufe, [`anlegen:${ICH.ref}`]);
  assert.equal(fetchAufrufe, 0, "kein Aufruf an den Projektraum");
});

test("Fehler des Speichers erreichen den Browser mit ihrem Status", async () => {
  const { DELETE } = route();
  const antwort = await DELETE(req("DELETE", `/anmerkungen/${ID}`, {}));
  assert.equal(antwort.status, 403);
});

test("Datensparsam: Beschriftung nur aus data-review-anker, nie aus dem Seitentext", () => {
  const el = (over: Partial<Record<string, unknown>>) =>
    ({
      getAttribute: (n: string) => (over.attrs as Record<string, string> | undefined)?.[n] ?? null,
      querySelector: () => ({ textContent: "Max Muster" }),
      id: over.id ?? "",
      tagName: over.tagName ?? "SECTION",
      children: { length: over.kinder ?? 0 },
      textContent: over.text ?? "",
    }) as unknown as Element;

  const sektion = el({ attrs: { "aria-label": "Bewerber Max Muster" } });
  assert.equal(ankerLabel(sektion), "Bewerber Max Muster");
  assert.equal(ankerLabel(sektion, true), "<section>");

  const benannt = el({ attrs: { "data-review-anker": "Bewerberprofil" } });
  assert.equal(ankerLabel(benannt, true), "Bewerberprofil");

  const knopf = el({ tagName: "BUTTON", text: "Max Muster anrufen" });
  const label = stellenLabel(knopf, benannt, true);
  assert.equal(label, "Bewerberprofil → <button>");
  assert.doesNotMatch(label, /Max/);
  // Ohne Datensparsam bleibt das alte Verhalten
  assert.match(stellenLabel(knopf, benannt, false), /Max Muster anrufen/);
});
