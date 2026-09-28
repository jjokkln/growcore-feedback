import { dienstkonto, zugriffsToken } from "./dienstkonto.ts";

/**
 * Die Leitung zu Gemini über Vertex AI — in der EU.
 *
 * ─── Wo das Modell läuft (Pflichtkern 1) ────────────────────────────────────
 *
 * `gemini-3.5-flash` gibt es in Europa nur in der **EU-Multiregion** (Stand
 * 27.09.2026: nicht einzeln in `europe-west1`/`-west3`, Google-Forum und
 * Modellübersicht). Der Endpunkt `aiplatform.eu.rep.googleapis.com` mit
 * `locations/eu` hält die Verarbeitung innerhalb der EU — anders als der
 * globale Endpunkt, der das Rechenzentrum frei wählt. Vertex AI nutzt die
 * Anfragen nicht zum Training (Google-Cloud-Bedingungen).
 *
 * Alle drei Angaben sind über die Umgebung überschreibbar (`KI_MODELL`,
 * `KI_ORT`, `KI_ENDPUNKT`), damit ein Modellwechsel kein Deployment von Code
 * braucht. ⚠️ Wer `KI_ORT` auf `global` setzt, verlässt die EU.
 *
 * Kein SDK: ein POST mit Bearer-Token und ein SSE-Strom, zeilenweise gelesen.
 */

const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

const SCHLUESSEL = "KI_SERVICE_ACCOUNT_KEY";

function einstellungen() {
  const konto = dienstkonto(SCHLUESSEL);
  const projekt = process.env.KI_PROJEKT?.trim() || konto.project_id;
  if (!projekt) throw new Error("Kein Google-Cloud-Projekt: KI_PROJEKT setzen oder project_id im Schlüssel.");
  return {
    projekt,
    modell: process.env.KI_MODELL?.trim() || "gemini-3.5-flash",
    ort: process.env.KI_ORT?.trim() || "eu",
    endpunkt: process.env.KI_ENDPUNKT?.trim() || "https://aiplatform.eu.rep.googleapis.com",
  };
}

import type { KiNachricht as Nachricht } from "../core/typen.ts";

export class KiFehler extends Error {
  readonly status: number;
  constructor(status: number, nachricht: string) {
    super(nachricht);
    this.status = status;
  }
}

/**
 * Stellt die Frage und liefert die Antwort als Strom von Textstücken.
 *
 * Denkteile (`thought: true`) fallen heraus — sie sind nicht für den Nutzer
 * bestimmt. Fehler VOR dem ersten Stück kommen als `KiFehler`, damit der
 * Endpunkt einen Status setzen kann; danach ist die Antwort schon unterwegs.
 */
export async function frageStreamen(
  system: string,
  verlauf: Nachricht[],
  signal?: AbortSignal,
): Promise<AsyncGenerator<string>> {
  const { projekt, modell, ort, endpunkt } = einstellungen();
  const url = `${endpunkt}/v1/projects/${encodeURIComponent(projekt)}/locations/${ort}/publishers/google/models/${modell}:streamGenerateContent?alt=sse`;

  const antwort = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      authorization: `Bearer ${await zugriffsToken(SCOPE, SCHLUESSEL)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: verlauf.map((n) => ({
        role: n.rolle === "nutzer" ? "user" : "model",
        parts: [{ text: n.text }],
      })),
      generationConfig: {
        temperature: 0.3,
        // Großzügig, weil Denk-Tokens bei Gemini mitzählen. Die Kürze der
        // Antwort regelt die Anweisung, nicht diese Grenze.
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!antwort.ok || !antwort.body) {
    const text = await antwort.text().catch(() => "");
    console.error(`[ki] Vertex ${antwort.status}:`, text.slice(0, 500));
    throw new KiFehler(antwort.status, text.slice(0, 200));
  }

  const leser = antwort.body.pipeThrough(new TextDecoderStream()).getReader();

  async function* stuecke(): AsyncGenerator<string> {
    let rest = "";
    for (;;) {
      const { value, done } = await leser.read();
      if (done) break;
      rest += value;
      // SSE: Ereignisse durch Leerzeilen getrennt, Nutzlast hinter „data: ".
      const zeilen = rest.split("\n");
      rest = zeilen.pop() ?? "";
      for (const zeile of zeilen) {
        if (!zeile.startsWith("data:")) continue;
        const roh = zeile.slice(5).trim();
        if (!roh) continue;
        try {
          const daten = JSON.parse(roh) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
          };
          for (const teil of daten.candidates?.[0]?.content?.parts ?? []) {
            if (teil.text && !teil.thought) yield teil.text;
          }
        } catch {
          // Eine vollständige Zeile ist vollständiges JSON (die angebrochene
          // letzte Zeile wartet in `rest`). Was trotzdem nicht parst, ist
          // kein Text für den Nutzer.
          console.error("[ki] unlesbares Ereignis:", roh.slice(0, 120));
        }
      }
    }
  }

  return stuecke();
}
