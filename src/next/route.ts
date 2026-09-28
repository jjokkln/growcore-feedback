import {
  antwortSchema,
  autorSchema,
  erledigtSchema,
  kiEingabeSchema,
  neueAnmerkungSchema,
  type Anmerkung,
  type Antwort,
  type Autor,
} from "../core/typen.ts";
import { systemAnweisung, type KiWissen } from "./anweisungen.ts";
import { besucherKennung, bremse } from "./bremse.ts";
import { eingang, EingangFehler } from "./eingang.ts";
import { frageStreamen, KiFehler } from "./gemini.ts";

/**
 * Der Server-Teil in der Kunden-App: eine Catch-all-Route, die das Overlay
 * bedient und an den Eingang weiterreicht.
 *
 *   // app/api/feedback/[...pfad]/route.ts
 *   import { feedbackRoute } from "@growcore/feedback/next";
 *   export const { GET, POST, PATCH, DELETE } = feedbackRoute({ ki: KI_WISSEN });
 *   export const dynamic = "force-dynamic";
 *
 * ─── Die Prüfungen, in dieser Reihenfolge ───────────────────────────────────
 *
 * 1. **Eingeschaltet?** `FEEDBACK=1`, sonst 404 — die Route gibt es dann nicht.
 *    Die KI-Hilfe braucht zusätzlich `KI_HILFE=1`.
 * 2. **Wer?** Kein Konto: Der Browser schickt eine selbst erzeugte Kennung
 *    (`x-gcf-autor`) und einen Namen (`x-gcf-name`). Die Kennung ist der
 *    Nachweis für „eigene Anmerkung löschen" und verlässt diesen Server nie
 *    in Richtung anderer Besucher (`zuBrowser`).
 * 3. **Wie viel?** Je Besucher 40 Schreibvorgänge und 20 KI-Fragen je Stunde;
 *    die Grenze je Projekt setzt der Eingang.
 * 4. **Was?** zod, dieselben Grenzen wie im Eingang.
 */

export interface FeedbackRouteOptionen {
  /** Ohne `ki` gibt es keine KI-Hilfe, auch nicht mit `KI_HILFE=1`. */
  ki?: KiWissen;
}

type Zeile = Omit<Anmerkung, "eigen" | "replies"> & {
  author_ref?: string | null;
  replies?: Array<Antwort & { author_ref?: string | null }>;
};

function json(daten: unknown, status = 200): Response {
  return Response.json(daten, { status, headers: { "cache-control": "no-store" } });
}

function fehler(status: number, text: string): Response {
  return json({ fehler: text }, status);
}

/** Kennung raus, `eigen` rein. Ohne das könnte jeder fremde Anmerkungen löschen. */
function zuBrowser(zeile: Zeile, ref: string | null): Anmerkung {
  const { author_ref, replies, ...rest } = zeile;
  return {
    ...rest,
    kind: rest.kind,
    eigen: Boolean(ref && author_ref && author_ref === ref && !rest.from_agency),
    replies: (replies ?? []).map(({ author_ref: _weg, ...a }) => a),
  };
}

function autorAus(request: Request): Autor | null {
  const ref = request.headers.get("x-gcf-autor");
  let name = "Gast";
  try {
    name = decodeURIComponent(request.headers.get("x-gcf-name") ?? "").trim() || "Gast";
  } catch {
    name = "Gast";
  }
  const geprueft = autorSchema.safeParse({ ref, label: name.slice(0, 120) });
  return geprueft.success ? geprueft.data : null;
}

async function leseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** `/api/feedback/anmerkungen/abc` → `["anmerkungen", "abc"]`. */
function segmente(request: Request): string[] {
  const teile = new URL(request.url).pathname.split("/").filter(Boolean);
  const ab = teile.indexOf("feedback");
  return ab === -1 ? [] : teile.slice(ab + 1);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function feedbackRoute(optionen: FeedbackRouteOptionen = {}) {
  const an = () => process.env.FEEDBACK === "1";

  async function behandle(request: Request, methode: string): Promise<Response> {
    if (!an()) return fehler(404, "Nicht gefunden.");
    const [bereich, id, unter] = segmente(request);

    try {
      if (bereich === "anmerkungen") return await anmerkungen(request, methode, id, unter);
      if (bereich === "ki-hilfe" && methode === "POST" && !id) return await kiHilfe(request);
      return fehler(404, "Nicht gefunden.");
    } catch (e) {
      if (e instanceof EingangFehler) return fehler(e.status, e.message);
      console.error("[feedback]", e instanceof Error ? e.message : e);
      return fehler(500, "Das hat nicht geklappt.");
    }
  }

  async function anmerkungen(
    request: Request,
    methode: string,
    id: string | undefined,
    unter: string | undefined,
  ): Promise<Response> {
    const autor = autorAus(request);

    if (methode === "GET" && !id) {
      const { anmerkungen: zeilen } = await eingang<{ anmerkungen: Zeile[] }>("/anmerkungen", { method: "GET" });
      return json({ anmerkungen: zeilen.map((z) => zuBrowser(z, autor?.ref ?? null)) });
    }

    if (!autor) return fehler(400, "Ohne Kennung lässt sich nichts speichern. Bitte die Seite neu laden.");
    if (!bremse(`schreiben:${besucherKennung(request)}`, 40, 3_600_000)) {
      return fehler(429, "Das waren viele Anmerkungen in kurzer Zeit. Bitte etwas später weitermachen.");
    }

    if (methode === "POST" && !id) {
      const eingabe = neueAnmerkungSchema.safeParse(await leseJson(request));
      if (!eingabe.success) return fehler(400, eingabe.error.issues[0]?.message ?? "Ungültige Anmerkung.");
      const { anmerkung } = await eingang<{ anmerkung: Zeile }>("/anmerkungen", {
        method: "POST",
        body: { ...eingabe.data, author: autor },
      });
      return json({ anmerkung: zuBrowser(anmerkung, autor.ref) }, 201);
    }

    if (!id || !UUID.test(id)) return fehler(404, "Unbekannte Anmerkung.");
    const pfad = `/anmerkungen/${id}`;

    if (methode === "POST" && unter === "antworten") {
      const eingabe = antwortSchema.safeParse(await leseJson(request));
      if (!eingabe.success) return fehler(400, eingabe.error.issues[0]?.message ?? "Ungültige Antwort.");
      await eingang(`${pfad}/antworten`, { method: "POST", body: { body: eingabe.data.body, author: autor } });
      return json({ ok: true }, 201);
    }
    if (methode === "PATCH" && !unter) {
      const eingabe = erledigtSchema.safeParse(await leseJson(request));
      if (!eingabe.success) return fehler(400, "Ungültige Änderung.");
      await eingang(pfad, { method: "PATCH", body: { done: eingabe.data.done, author: autor } });
      return json({ ok: true });
    }
    if (methode === "DELETE" && !unter) {
      await eingang(pfad, { method: "DELETE", body: { author: autor } });
      return json({ ok: true });
    }
    return fehler(404, "Nicht gefunden.");
  }

  async function kiHilfe(request: Request): Promise<Response> {
    const ki = optionen.ki;
    if (!ki || process.env.KI_HILFE !== "1") return fehler(503, "Die KI-Hilfe ist nicht eingeschaltet.");
    if (!bremse(`ki:${besucherKennung(request)}`, 20, 3_600_000)) {
      return fehler(429, "Das waren viele Fragen in kurzer Zeit. Bitte in einer Stunde wieder versuchen.");
    }

    const eingabe = kiEingabeSchema.safeParse(await leseJson(request));
    if (!eingabe.success) return fehler(400, eingabe.error.issues[0]?.message ?? "Ungültige Anfrage.");
    const { seite, nachrichten } = eingabe.data;
    const frage = nachrichten[nachrichten.length - 1]?.text ?? "";

    // Erst melden, dann fragen: Jede Frage gehört in den Eingang (DECISIONS
    // 2026-09-28a), und der Eingang ist zugleich die Bremse je Projekt.
    // Scheitert die Meldung, wird nicht gefragt.
    await eingang("/ki-fragen", { method: "POST", body: { question: frage.slice(0, 2000), path: seite } });

    let stuecke: AsyncGenerator<string>;
    try {
      stuecke = await frageStreamen(systemAnweisung(ki, seite), nachrichten, request.signal);
    } catch (e) {
      const status = e instanceof KiFehler ? e.status : 0;
      console.error("[ki] Anfrage gescheitert:", status, e instanceof Error ? e.message : e);
      return new Response("Die KI hat gerade nicht geantwortet. Bitte gleich noch einmal versuchen.", {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const kodierer = new TextEncoder();
    const strom = new ReadableStream<Uint8Array>({
      async start(controller) {
        let ausgabe = 0;
        try {
          for await (const stueck of stuecke) {
            ausgabe += stueck.length;
            controller.enqueue(kodierer.encode(stueck));
          }
          if (ausgabe === 0) controller.enqueue(kodierer.encode("Dazu habe ich gerade keine Antwort."));
        } catch (e) {
          console.error("[ki] Strom abgebrochen:", e instanceof Error ? e.message : e);
          controller.enqueue(kodierer.encode("\n\n(Die Antwort wurde unterbrochen.)"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(strom, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  return {
    GET: (request: Request) => behandle(request, "GET"),
    POST: (request: Request) => behandle(request, "POST"),
    PATCH: (request: Request) => behandle(request, "PATCH"),
    DELETE: (request: Request) => behandle(request, "DELETE"),
  };
}
