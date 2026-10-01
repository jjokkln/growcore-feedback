import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

import { feedbackRoute, type FeedbackRouteOptionen } from "../next/route.ts";

export { besucherAutor, type FeedbackRouteOptionen } from "../next/route.ts";
export { eingangsSpeicher, type FeedbackSpeicher } from "../next/speicher.ts";
export { EingangFehler } from "../next/eingang.ts";

/**
 * Die Route für Projekte ohne Next (0.8.0): Express oder eine klassische
 * Vercel-Funktion (`@vercel/node`, `(req, res)`). Dieselbe Logik wie
 * `feedbackRoute` — hier nur von Node-Anfrage auf Web-`Request` übersetzt.
 *
 *   // api/feedback.js  (vercel.json: "/api/feedback/(.*)" → "/api/feedback.js")
 *   const { feedbackNodeHandler } = await import("@growcore/feedback/node");
 *   module.exports = feedbackNodeHandler({ identitaet: … });
 */
export function feedbackNodeHandler(optionen: FeedbackRouteOptionen = {}) {
  const route = feedbackRoute(optionen);
  const methoden: Record<string, (r: Request) => Promise<Response>> = {
    GET: route.GET,
    POST: route.POST,
    PATCH: route.PATCH,
    DELETE: route.DELETE,
  };
  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> => {
    const methode = (req.method ?? "GET").toUpperCase();
    const behandle = methoden[methode];
    const antwort = behandle
      ? await behandle(await alsRequest(req, methode))
      : Response.json({ fehler: "Nicht gefunden." }, { status: 404 });
    await schreibe(res, antwort);
  };
}

/** Die eigenständige Fassung (`standalone/gcf.js`) als Text — zum Ausliefern unter eigenem Pfad. */
export async function standaloneSkript(): Promise<string> {
  return readFile(new URL("../../standalone/gcf.js", import.meta.url), "utf8");
}

async function alsRequest(req: IncomingMessage & { body?: unknown }, methode: string): Promise<Request> {
  const host = req.headers.host ?? "localhost";
  const headers = new Headers();
  for (const [name, wert] of Object.entries(req.headers)) {
    if (wert === undefined) continue;
    headers.set(name, Array.isArray(wert) ? wert.join(", ") : wert);
  }
  let body: string | undefined;
  if (methode !== "GET") {
    // Express/Vercel haben den Body oft schon gelesen und als Objekt abgelegt.
    if (req.body !== undefined) body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    else body = await leseStrom(req);
  }
  return new Request(`http://${host}${req.url ?? "/"}`, { method: methode, headers, body });
}

async function leseStrom(req: IncomingMessage): Promise<string> {
  const teile: Buffer[] = [];
  let laenge = 0;
  for await (const teil of req) {
    const stueck = Buffer.isBuffer(teil) ? teil : Buffer.from(teil);
    laenge += stueck.length;
    // Eine Anmerkung hat höchstens 4.000 Zeichen und 800 Punkte; mehr ist kein Overlay.
    if (laenge > 256_000) break;
    teile.push(stueck);
  }
  return Buffer.concat(teile).toString("utf8");
}

async function schreibe(res: ServerResponse, antwort: Response): Promise<void> {
  res.statusCode = antwort.status;
  antwort.headers.forEach((wert, name) => res.setHeader(name, wert));
  res.end(Buffer.from(await antwort.arrayBuffer()));
}
