/**
 * Das Google-Dienstkonto — Schlüssel und Zugriffstoken.
 *
 * Der ganze JSON-Schlüssel steht in EINER Variablen, `KI_SERVICE_ACCOUNT_KEY`.
 * Das Konto braucht nur die Rolle „Vertex AI User".
 *
 * ─── Warum kein `google-auth-library` ────────────────────────────────────────
 *
 * Der Dienstkonto-Flow ist ein signiertes JWT gegen einen Endpunkt, gebaut aus
 * `node:crypto`. Die Bibliothek zöge einen Abhängigkeitsbaum ein, der bei
 * jedem `npm audit` mitläuft — bei genau einem Flow ein schlechter Tausch.
 */

import { createSign } from "node:crypto";

const TOKEN_ENDPUNKT = "https://oauth2.googleapis.com/token";

// ─────────────────────────────────────────────────────────────────────────────
// Der Schlüssel
// ─────────────────────────────────────────────────────────────────────────────

interface Dienstkonto {
  client_email: string;
  private_key: string;
  /** Das Google-Cloud-Projekt des Kontos — die KI-Hilfe rechnet darüber ab. */
  project_id?: string;
}

/**
 * Das Dienstkonto aus der Umgebung.
 *
 * Der ganze JSON-Schlüssel in **einer** Variablen statt Mailadresse und
 * Schlüssel in zweien: Google liefert die Datei als Ganzes, und zwei Variablen
 * sind zwei Gelegenheiten, eine davon zu vergessen — eine halb eingerichtete
 * Umgebung scheitert dann mit „invalid_grant" statt mit „da fehlt was".
 *
 * ⚠️ Der private Schlüssel enthält echte Zeilenumbrüche. Im JSON stehen sie als
 * `\n`, und `JSON.parse` macht daraus die richtigen Zeichen — deshalb wird hier
 * geparst und nicht mit `replace` an einer Zeichenkette gearbeitet. Wer den
 * Schlüssel von Hand in eine Umgebungsvariable kopiert und die Umbrüche dabei
 * verliert, bekommt von OpenSSL eine Meldung über einen kaputten PEM-Block.
 *
 * ⚠️ **Umschließende Anführungszeichen werden abgeschnitten** — und das ist
 * keine vorsorgliche Nachsicht, sondern die Reparatur eines gemessenen
 * Fehlers (13.09.2026, Produktion): In `.env.local` steht der Wert als
 * `GOOGLE_SERVICE_ACCOUNT_KEY='{…}'`, weil eine Datei mit geschweiften
 * Klammern in einer Shell sonst nicht überlebt. **Dotenv entfernt diese
 * Anführungszeichen beim Einlesen, das Eingabefeld bei Vercel nicht** — dort
 * ist der getippte Text der Wert. Wer die Zeile aus der einen Datei in das
 * andere Feld kopiert, hat ein `'` am Anfang, und `JSON.parse` scheitert an
 * genau einem Zeichen. Lokal lief es, in der Cloud nicht: der Unterschied, der
 * am schwersten zu finden ist.
 */
export function dienstkonto(variable = "KI_SERVICE_ACCOUNT_KEY"): Dienstkonto {
  const roh = process.env[variable];
  if (!roh?.trim()) {
    throw new Error(
      `${variable} fehlt. Ohne den Schlüssel gibt es keine KI-Hilfe.`,
    );
  }

  const getrimmt = roh.trim();
  const entpackt =
    (getrimmt.startsWith("'") && getrimmt.endsWith("'")) ||
    (getrimmt.startsWith('"') && getrimmt.endsWith('"'))
      ? getrimmt.slice(1, -1)
      : getrimmt;

  let konto: Partial<Dienstkonto>;
  try {
    konto = JSON.parse(entpackt) as Partial<Dienstkonto>;
  } catch {
    throw new Error(
      `${variable} ist kein gültiges JSON. Erwartet wird der ` +
        "Inhalt der Schlüsseldatei aus der Google Cloud Console — beginnend " +
        "mit { und endend mit }, nicht der Dateipfad und nicht die ganze " +
        `Zeile aus einer .env. Gefunden: ${entpackt.length} Zeichen, ` +
        `beginnend mit „${entpackt.slice(0, 12)}…".`,
    );
  }

  if (!konto.client_email || !konto.private_key) {
    throw new Error(
      `${variable} enthält kein client_email/private_key.`,
    );
  }

  return {
    client_email: konto.client_email,
    private_key: konto.private_key,
    project_id: konto.project_id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Das Zugriffstoken
// ─────────────────────────────────────────────────────────────────────────────

function base64url(wert: string | Buffer): string {
  return Buffer.from(wert).toString("base64url");
}

/**
 * Zwischenspeicher für das Zugriffstoken.
 *
 * Ein Token gilt eine Stunde. Ein Abgleich macht bis zu einige Dutzend Aufrufe,
 * und für jeden ein neues Token zu holen wäre eine Verdopplung der Netzrunden
 * ohne jeden Gegenwert. Der Speicher lebt so lange wie die Serverless-Instanz —
 * dass er beim nächsten Kaltstart leer ist, kostet genau einen Aufruf und ist
 * deshalb kein Grund, hier etwas Dauerhaftes zu bauen.
 */
const tokens = new Map<string, { wert: string; laeuftAb: number }>();

/** Ein Zugriffstoken für genau einen Scope, eine Stunde zwischengespeichert. */
export async function zugriffsToken(
  scope: string,
  variable = "KI_SERVICE_ACCOUNT_KEY",
): Promise<string> {
  const schluessel = `${variable}|${scope}`;
  const token = tokens.get(schluessel);
  // 60 Sekunden Sicherheitsabstand: Ein Token, das während des Aufrufs abläuft,
  // erzeugt eine 401 mitten im Abgleich — und die sieht aus wie ein
  // Rechteproblem, ist aber eine Uhr.
  if (token && token.laeuftAb > Date.now() + 60_000) return token.wert;

  const konto = dienstkonto(variable);
  const jetzt = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: konto.client_email,
      scope,
      aud: TOKEN_ENDPUNKT,
      iat: jetzt,
      // Eine Stunde ist das Maximum, das Google akzeptiert. Mehr führt zu
      // `invalid_grant`, was nach einem falschen Schlüssel aussieht.
      exp: jetzt + 3600,
    }),
  );

  const signatur = createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(konto.private_key);

  const antwort = await fetch(TOKEN_ENDPUNKT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${base64url(signatur)}`,
    }),
  });

  if (!antwort.ok) {
    // Googles Fehlertext mitnehmen: `invalid_grant` allein ist mehrdeutig
    // (falscher Schlüssel, gelöschtes Konto, Uhr verstellt), die Beschreibung
    // daneben unterscheidet die Fälle.
    throw new Error(
      `Anmeldung am Dienstkonto fehlgeschlagen (${antwort.status}): ${await antwort.text()}`,
    );
  }

  const daten = (await antwort.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokens.set(schluessel, {
    wert: daten.access_token,
    laeuftAb: Date.now() + daten.expires_in * 1000,
  });
  return daten.access_token;
}
