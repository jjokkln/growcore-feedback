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
  if (!antwort.ok) {
    if (antwort.status === 401) console.error("[feedback] Schlüssel abgewiesen — GROWCORE_FEEDBACK_KEY prüfen.");
    const status = antwort.status === 401 ? 503 : antwort.status;
    const text =
      antwort.status === 401
        ? "Das Feedback-Werkzeug ist nicht richtig eingerichtet."
        : antwort.status === 429
          ? "Gerade kommen sehr viele Anmerkungen an. Bitte in einer Stunde noch einmal versuchen."
          : (daten.fehler ?? "Das hat nicht geklappt.");
    throw new EingangFehler(status, text);
  }
  return daten as T;
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
 */
export async function eingangStatus(): Promise<boolean> {
  const schluessel = process.env.GROWCORE_FEEDBACK_KEY?.trim();
  if (!schluessel) return false;
  const basis = (process.env.GROWCORE_FEEDBACK_URL?.trim() || STANDARD_URL).replace(/\/$/, "");
  try {
    const antwort = await fetch(`${basis}/api/feedback/status`, {
      headers: { authorization: `Bearer ${schluessel}` },
      cache: "no-store",
    });
    if (antwort.status === 404) return true;
    if (!antwort.ok) {
      if (antwort.status === 401) console.error("[feedback] Schlüssel abgewiesen — GROWCORE_FEEDBACK_KEY prüfen.");
      return false;
    }
    const daten = (await antwort.json().catch(() => ({}))) as { an?: unknown };
    return daten.an === true;
  } catch (e) {
    console.error("[feedback] Eingang nicht erreichbar:", e instanceof Error ? e.message : e);
    return false;
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
