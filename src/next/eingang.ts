import { personenSchema } from "../core/typen.ts";

/**
 * Die Leitung zum Feedback-Eingang im Projektraum (lennys-projekte.de).
 *
 * Nur Server zu Server: Der Eingang erlaubt kein CORS, und der Schlüssel
 * (`GROWCORE_FEEDBACK_KEY`, beginnt mit `gcf_`) darf nie in den Browser.
 * Welches Projekt es ist, weiß der Eingang aus dem Schlüssel.
 */

const STANDARD_URL = "https://www.lennys-projekte.de";

export class EingangFehler extends Error {
  readonly status: number;
  constructor(status: number, nachricht: string) {
    super(nachricht);
    this.status = status;
  }
}

export function eingangBereit(): boolean {
  return Boolean(process.env.GROWCORE_FEEDBACK_KEY?.trim());
}

function fehlerAus(status: number, daten: { fehler?: string }): EingangFehler {
  if (status === 401) console.error("[feedback] Schlüssel abgewiesen — GROWCORE_FEEDBACK_KEY prüfen.");
  const neu = status === 401 ? 503 : status;
  const text =
    status === 401
      ? "Das Feedback-Werkzeug ist nicht richtig eingerichtet."
      : status === 429
        ? (daten.fehler ?? "Gerade kommen sehr viele Anfragen an. Bitte in einer Stunde noch einmal versuchen.")
        : (daten.fehler ?? "Das hat nicht geklappt.");
  return new EingangFehler(neu, text);
}

export async function eingang<T>(
  pfad: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<T> {
  const schluessel = process.env.GROWCORE_FEEDBACK_KEY?.trim();
  if (!schluessel) throw new EingangFehler(503, "Das Feedback-Werkzeug ist nicht eingerichtet.");
  const basis = (process.env.GROWCORE_FEEDBACK_URL?.trim() || STANDARD_URL).replace(/\/$/, "");

  let antwort: Response;
  try {
    antwort = await fetch(`${basis}/api/feedback${pfad}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${schluessel}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch (e) {
    console.error("[feedback] Eingang nicht erreichbar:", e instanceof Error ? e.message : e);
    throw new EingangFehler(502, "Der Feedback-Eingang ist gerade nicht erreichbar.");
  }

  const daten = (await antwort.json().catch(() => ({}))) as { fehler?: string };
  if (!antwort.ok) throw fehlerAus(antwort.status, daten);
  return daten as T;
}

/**
 * Wie `eingang`, aber die Antwort ist ein Strom (0.12.0, KI-Assistent): Bei
 * Erfolg kommt der Körper unverändert zurück, die Route reicht ihn durch.
 */
export async function eingangStrom(
  pfad: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const schluessel = process.env.GROWCORE_FEEDBACK_KEY?.trim();
  if (!schluessel) throw new EingangFehler(503, "Das Feedback-Werkzeug ist nicht eingerichtet.");
  const basis = (process.env.GROWCORE_FEEDBACK_URL?.trim() || STANDARD_URL).replace(/\/$/, "");

  let antwort: Response;
  try {
    antwort = await fetch(`${basis}/api/feedback${pfad}`, {
      method: "POST",
      headers: { authorization: `Bearer ${schluessel}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (e) {
    console.error("[feedback] Eingang nicht erreichbar:", e instanceof Error ? e.message : e);
    throw new EingangFehler(502, "Der Assistent ist gerade nicht erreichbar.");
  }
  if (!antwort.ok || !antwort.body) {
    const daten = (await antwort.json().catch(() => ({}))) as { fehler?: string };
    throw fehlerAus(antwort.ok ? 502 : antwort.status, daten);
  }
  return antwort.body;
}

/**
 * Fragt die Sammelstelle, ob das Werkzeug für dieses Projekt an ist (0.7.0).
 *
 * - `{ an: true|false }` → genau das.
 * - 404 → die Sammelstelle kennt den Schalter noch nicht (ältere Fassung):
 *   „an", damit ein Paket-Update nichts ausschaltet, bevor die Sammelstelle
 *   nachgezogen ist.
 * - Alles andere (kein Schlüssel, abgewiesen, nicht erreichbar) → „aus".
 *   Lieber kein Werkzeug als eines, das bei jedem Klick einen Fehler zeigt.
 *
 * Assistent und „Idee“ (0.16.2) nur, wenn die Sammelstelle sie ausdrücklich
 * meldet: Der Projektraum sagt `assistent: true, ideen: true`, galdora-network
 * (eigener Eingang ohne diese Pfade) sagt nichts davon.
 */
export async function eingangStatus(): Promise<{ an: boolean; assistent: boolean; ideen: boolean }> {
  const aus = { an: false, assistent: false, ideen: false };
  const schluessel = process.env.GROWCORE_FEEDBACK_KEY?.trim();
  if (!schluessel) return aus;
  const basis = (process.env.GROWCORE_FEEDBACK_URL?.trim() || STANDARD_URL).replace(/\/$/, "");
  try {
    const antwort = await fetch(`${basis}/api/feedback/status`, {
      headers: { authorization: `Bearer ${schluessel}` },
      cache: "no-store",
    });
    if (antwort.status === 404) return { an: true, assistent: false, ideen: false };
    if (!antwort.ok) {
      if (antwort.status === 401) console.error("[feedback] Schlüssel abgewiesen — GROWCORE_FEEDBACK_KEY prüfen.");
      return aus;
    }
    const daten = (await antwort.json().catch(() => ({}))) as { an?: unknown; assistent?: unknown; ideen?: unknown };
    return { an: daten.an === true, assistent: daten.assistent === true, ideen: daten.ideen === true };
  } catch (e) {
    console.error("[feedback] Eingang nicht erreichbar:", e instanceof Error ? e.message : e);
    return aus;
  }
}

/**
 * Die Personenliste des Projekts (0.9.0). Alles außer einer gültigen Liste ergibt `[]`:
 * Ältere Sammelstellen kennen den Pfad nicht (404), und ohne Liste bleibt es beim freien
 * Namensfeld — das Werkzeug soll daran nicht scheitern.
 */
export async function eingangPersonen(): Promise<string[]> {
  const schluessel = process.env.GROWCORE_FEEDBACK_KEY?.trim();
  if (!schluessel) return [];
  const basis = (process.env.GROWCORE_FEEDBACK_URL?.trim() || STANDARD_URL).replace(/\/$/, "");
  try {
    const antwort = await fetch(`${basis}/api/feedback/personen`, {
      headers: { authorization: `Bearer ${schluessel}` },
      cache: "no-store",
    });
    if (!antwort.ok) return [];
    const daten = (await antwort.json().catch(() => ({}))) as { personen?: unknown };
    const geprueft = personenSchema.safeParse(daten.personen);
    return geprueft.success ? geprueft.data : [];
  } catch (e) {
    console.error("[feedback] Eingang nicht erreichbar:", e instanceof Error ? e.message : e);
    return [];
  }
}
