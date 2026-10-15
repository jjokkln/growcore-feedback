import {
  antwortSchema,
  assistentEingabeSchema,
  autorSchema,
  erledigtSchema,
  ideeSchema,
  neueAnmerkungSchema,
  type Anmerkung,
  type Autor,
} from "../core/typen.ts";
import { wissenFuerSammelstelle, type KiWissen } from "./anweisungen.ts";
import { besucherKennung, bremse } from "./bremse.ts";
import { EingangFehler } from "./eingang.ts";
import { eingangsSpeicher, type FeedbackSpeicher, type Zeile } from "./speicher.ts";

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
 *    Dazu (0.7.0) der Schalter bei der Sammelstelle (`speicher.status()`,
 *    30 s gemerkt): aus → jeder Pfad 404, `GET /status` sagt `{ an: false }`.
 *    Der KI-Assistent (0.12.0) braucht zusätzlich `KI_HILFE=1`, das Wissen
 *    (`ki`) und einen Speicher mit `assistent`; `GET /status` meldet, ob er
 *    und der Knopf „Idee“ da sind.
 * 2. **Wer?** Kein Konto: Der Browser schickt eine selbst erzeugte Kennung
 *    (`x-gcf-autor`) und einen Namen (`x-gcf-name`). Die Kennung ist der
 *    Nachweis für „eigene Anmerkung löschen" und verlässt diesen Server nie
 *    in Richtung anderer Besucher (`zuBrowser`).
 * 3. **Wie viel?** Je Besucher 40 Schreibvorgänge und 30 Fragen an den
 *    Assistenten je Stunde; die Grenzen je Projekt setzt der Eingang.
 * 4. **Was?** zod, dieselben Grenzen wie im Eingang.
 */

export interface FeedbackRouteOptionen {
  /** Ohne `ki` gibt es keinen KI-Assistenten, auch nicht mit `KI_HILFE=1`. */
  ki?: KiWissen;
  /**
   * Eigener Speicher statt des Eingangs im Projektraum. Für Projekte, deren
   * Seiten Personendaten zeigen: Anmerkungen bleiben in der eigenen Datenbank.
   */
  speicher?: FeedbackSpeicher;
  /**
   * Wer fragt, festgestellt vom Server (Sitzung), nicht vom Browser. Gibt die
   * Funktion `null` zurück, ist die Antwort 401, und zwar für **jede** Route,
   * auch Lesen und KI-Hilfe. Ohne diese Option gilt die Kennung aus dem Browser
   * (Besucher ohne Konto).
   */
  identitaet?: (request: Request) => Promise<Autor | null>;
}

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

/**
 * Der Autor aus den Kopfzeilen des Overlays (Kennung + Name aus dem Browser).
 * Exportiert (0.8.0) für Projekte mit gemeinsamer Sperre statt Konten: deren
 * `identitaet` prüft erst die Sitzung und gibt dann diesen Autor zurück.
 */
export function besucherAutor(request: Request): Autor | null {
  return autorAus(request);
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

/**
 * Lennys Zugang aus der Kopfzeile `x-gcf-agentur` (0.15.0). Hier nur die Form;
 * ob er gilt, entscheidet die Sammelstelle.
 */
function agenturAus(request: Request): string | null {
  const wert = request.headers.get("x-gcf-agentur")?.trim();
  return wert && /^gcl_[A-Za-z0-9_.-]{20,1000}$/.test(wert) ? wert : null;
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
  const speicher = optionen.speicher ?? eingangsSpeicher;
  const assistentAn = () => Boolean(optionen.ki && speicher.assistent && process.env.KI_HILFE === "1");
  /** Mit Konto zählt das Konto, sonst die Kennung des Browsers. */
  const wer = async (request: Request): Promise<Autor | null> =>
    optionen.identitaet ? optionen.identitaet(request) : autorAus(request);
  const schluessel = (request: Request, autor: Autor | null) =>
    optionen.identitaet && autor ? autor.ref : besucherKennung(request);

  // Der Schalter bei der Sammelstelle, je Server-Instanz 30 s gemerkt: Das
  // Overlay fragt bei jedem Laden, und nicht jeder Aufruf soll die
  // Sammelstelle zweimal treffen. Ausschalten wirkt also nach spätestens 30 s.
  let schalter: { an: boolean; bis: number } | null = null;
  const zentralAn = async (): Promise<boolean> => {
    if (!speicher.status) return true;
    if (schalter && schalter.bis > Date.now()) return schalter.an;
    const jetzt = await speicher.status().catch(() => false);
    schalter = { an: jetzt, bis: Date.now() + 30_000 };
    return jetzt;
  };

  // Die Personenliste, ebenso 30 s gemerkt: Das Overlay fragt sie bei jedem Öffnen.
  let personen: { liste: string[]; bis: number } | null = null;
  const personenListe = async (): Promise<string[]> => {
    if (!speicher.personen) return [];
    if (personen && personen.bis > Date.now()) return personen.liste;
    const jetzt = await speicher.personen().catch(() => []);
    personen = { liste: jetzt, bis: Date.now() + 30_000 };
    return jetzt;
  };

  async function behandle(request: Request, methode: string): Promise<Response> {
    if (!an()) return fehler(404, "Nicht gefunden.");
    const [bereich, id, unter] = segmente(request);

    if (bereich === "status" && !id && methode === "GET") {
      // Ohne Anmeldung beantwortbar: Es verrät nur, ob das `?` erscheinen soll,
      // und welche Teile (0.12.0) — Assistent und „Idee“ hängen am Speicher.
      if (!(await zentralAn())) return json({ an: false });
      return json({ an: true, assistent: assistentAn(), ideen: Boolean(speicher.idee) });
    }
    if (!(await zentralAn())) return fehler(404, "Das Feedback-Werkzeug ist ausgeschaltet.");

    try {
      const autor = await wer(request);
      if (optionen.identitaet && !autor) return fehler(401, "Bitte melde dich an.");
      if (bereich === "anmerkungen") return await anmerkungen(request, methode, id, unter, autor);
      // Erst nach Schalter und Identität: Die Namen sieht nur, wer das Werkzeug auch benutzen darf.
      if (bereich === "personen" && methode === "GET" && !id) return json({ personen: await personenListe() });
      if (bereich === "assistent" && methode === "POST" && !id) return await assistent(request, autor);
      if (bereich === "ideen" && methode === "POST" && !id) return await idee(request, autor);
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
    autor: Autor | null,
  ): Promise<Response> {
    if (methode === "GET" && !id) {
      const zeilen = await speicher.liste();
      return json({ anmerkungen: zeilen.map((z) => zuBrowser(z, autor?.ref ?? null)) });
    }

    if (!autor) return fehler(400, "Ohne Kennung lässt sich nichts speichern. Bitte die Seite neu laden.");
    if (!bremse(`schreiben:${schluessel(request, autor)}`, 40, 3_600_000)) {
      return fehler(429, "Das waren viele Anmerkungen in kurzer Zeit. Bitte etwas später weitermachen.");
    }

    if (methode === "POST" && !id) {
      const eingabe = neueAnmerkungSchema.safeParse(await leseJson(request));
      if (!eingabe.success) return fehler(400, eingabe.error.issues[0]?.message ?? "Ungültige Anmerkung.");
      const anmerkung = await speicher.anlegen(eingabe.data, autor, agenturAus(request));
      return json({ anmerkung: zuBrowser(anmerkung, autor.ref) }, 201);
    }

    if (!id || !UUID.test(id)) return fehler(404, "Unbekannte Anmerkung.");

    if (methode === "POST" && unter === "antworten") {
      const eingabe = antwortSchema.safeParse(await leseJson(request));
      if (!eingabe.success) return fehler(400, eingabe.error.issues[0]?.message ?? "Ungültige Antwort.");
      await speicher.antworten(id, eingabe.data.body, autor, agenturAus(request));
      return json({ ok: true }, 201);
    }
    if (methode === "PATCH" && !unter) {
      const eingabe = erledigtSchema.safeParse(await leseJson(request));
      if (!eingabe.success) return fehler(400, "Ungültige Änderung.");
      await speicher.erledigt(id, eingabe.data.done, autor);
      return json({ ok: true });
    }
    if (methode === "DELETE" && !unter) {
      await speicher.loeschen(id, autor, agenturAus(request));
      return json({ ok: true });
    }
    return fehler(404, "Nicht gefunden.");
  }

  async function assistent(request: Request, autor: Autor | null): Promise<Response> {
    const ki = optionen.ki;
    if (!ki || !speicher.assistent || process.env.KI_HILFE !== "1") {
      return fehler(503, "Der KI-Assistent ist nicht eingeschaltet.");
    }
    if (!bremse(`ki:${schluessel(request, autor)}`, 30, 3_600_000)) {
      return fehler(429, "Das waren viele Fragen in kurzer Zeit. Bitte in einer Stunde wieder versuchen.");
    }
    const eingabe = assistentEingabeSchema.safeParse(await leseJson(request));
    if (!eingabe.success) return fehler(400, eingabe.error.issues[0]?.message ?? "Ungültige Anfrage.");

    // Die Sammelstelle hält die Frage fest, zählt die Kosten und antwortet als
    // NDJSON. Fehler VOR dem Strom kommen als EingangFehler (→ JSON mit Satz).
    const strom = await speicher.assistent(
      {
        ...eingabe.data,
        autor: autor && autor.label !== "Gast" ? autor.label : null,
        wissen: wissenFuerSammelstelle(ki),
      },
      request.signal,
    );
    return new Response(strom, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  async function idee(request: Request, autor: Autor | null): Promise<Response> {
    if (!speicher.idee) return fehler(404, "Nicht gefunden.");
    if (!autor) return fehler(400, "Ohne Kennung lässt sich nichts speichern. Bitte die Seite neu laden.");
    if (!bremse(`schreiben:${schluessel(request, autor)}`, 40, 3_600_000)) {
      return fehler(429, "Das waren viele Einträge in kurzer Zeit. Bitte etwas später weitermachen.");
    }
    const eingabe = ideeSchema.safeParse(await leseJson(request));
    if (!eingabe.success) return fehler(400, eingabe.error.issues[0]?.message ?? "Ungültige Idee.");
    await speicher.idee(eingabe.data, autor);
    return json({ ok: true }, 201);
  }

  return {
    GET: (request: Request) => behandle(request, "GET"),
    POST: (request: Request) => behandle(request, "POST"),
    PATCH: (request: Request) => behandle(request, "PATCH"),
    DELETE: (request: Request) => behandle(request, "DELETE"),
  };
}
