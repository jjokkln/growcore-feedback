# Einbauanleitung — `@growcore/feedback`

Zum Abarbeiten von vorne bis hinten, für Mensch oder KI. Zielstack: **Next.js
(App Router) auf Vercel**. Das Repo ist öffentlich:
<https://github.com/jjokkln/growcore-feedback>

## 0. Was das ist

Das Feedback-Werkzeug für jedes GrowCore-Projekt **in Entwicklung**:

- **Anmerkungen in beide Richtungen.** Besucher klicken irgendwohin und
  schreiben, oder kreisen einen Bereich ein. GrowCore setzt Fragen, Hinweise
  und „Geändert – bitte prüfen“ aus dem Projektraum. Beide antworten sich an
  der Stelle, haken ab, exportieren als Markdown.
- **KI-Hilfe** unten rechts: erklärt, was wo steht, und zeigt Schritt für
  Schritt auf die Stelle.

**Gespeichert wird nichts im Projekt.** Alles landet im zentralen Eingang des
Projektraums (lennys-projekte.de). Die Seite braucht **keine eigene Datenbank**,
aber Server-Routen, also **kein `output: 'export'`**.

Grundsatz: DECISIONS 2026-09-28a im AI-OS.

## 1. Installieren

```bash
npm i "git+https://github.com/jjokkln/growcore-feedback.git#v0.1.0"
```

Immer auf einen **Tag** festnageln, nie auf `main`. `npm` schreibt `git+ssh://`
in die Lockfile; Vercel fällt beim öffentlichen Repo auf HTTPS zurück (bei
`@growcore/a11y` gemessen). `dist/` entsteht beim Installieren über `prepare`.

## 2. Schlüssel holen

Im Projektraum (MCP) für das Projekt:

```
feedback_schluessel_erzeugen(project_id | aios_slug)
```

Der Klartext (`gcf_…`) kommt **genau einmal**. Direkt in die Vercel-Umgebung,
nirgends sonst hin.

## 3. Umgebung (Vercel → Settings → Environment Variables)

| Variable | Wert | Zweck |
| --- | --- | --- |
| `FEEDBACK` | `1` | Werkzeug an. Ohne: keine Route, kein Client-Code |
| `GROWCORE_FEEDBACK_KEY` | `gcf_…` | Schlüssel aus Schritt 2, **nur Server** |
| `KI_HILFE` | `1` | KI-Hilfe an (optional) |
| `KI_SERVICE_ACCOUNT_KEY` | JSON des Dienstkontos | Vertex AI, Rolle „Vertex AI User“ |
| `KI_PROJEKT` | GCP-Projekt-ID | nur, wenn nicht im Schlüssel |

Region und Modell stehen im Paket: `gemini-3.5-flash`, EU-Multiregion
(`aiplatform.eu.rep.googleapis.com`). Überschreibbar mit `KI_MODELL`, `KI_ORT`,
`KI_ENDPUNKT`. ⚠️ `KI_ORT=global` verlässt die EU.

⚠️ Den JSON-Schlüssel **ohne** umschließende Anführungszeichen ins
Vercel-Feld kopieren (der Code verzeiht sie, aber nur einfache).

Umgebungsvariablen greifen erst im **nächsten Deployment**.

## 4. Route anlegen

`src/app/api/feedback/[...pfad]/route.ts`:

```ts
import { feedbackRoute } from "@growcore/feedback/next";
import { KI_WISSEN } from "@/content/ki-wissen";

export const { GET, POST, PATCH, DELETE } = feedbackRoute({ ki: KI_WISSEN });
export const dynamic = "force-dynamic";
```

## 5. Wissen und Ziele für die KI-Hilfe

`src/content/ki-wissen.ts` — **die einzige Quelle**, aus der die KI antwortet.
Nie das AI-OS, nie Kundendaten.

```ts
import type { KiWissen } from "@growcore/feedback/next";
import type { ZielKatalog } from "@growcore/feedback";

export const ZIELE: ZielKatalog = {
  "nav-partner": { name: "„Partner“ in der Navigation", selektoren: [{ css: 'a[href="/partner"]' }] },
};

export const KI_WISSEN: KiWissen = {
  produkt: "Website von …",
  wissen: String.raw`… was auf welcher Seite steht …`,
  ziele: ZIELE,
};
```

Regeln: kein Backtick im Wissenstext; eine Zahl darin ist eine Zusage
(Pflichtkern 5); **eine neue Seite ist erst fertig, wenn Wissen und Ziele sie
kennen.**

## 6. Im Layout einbinden

```tsx
import { FeedbackWerkzeug } from "@growcore/feedback/next";
import { ZIELE } from "@/content/ki-wissen";

// im <body>, nach dem Inhalt:
<FeedbackWerkzeug projekt="Website von …" ziele={ZIELE} vorschlaege={["Wo finde ich …?"]} />
```

Und das CSS nach dem eigenen, z. B. in `globals.css`:

```css
@import "@growcore/feedback/styles.css";
:root { --gcf-primaer: <Projektfarbe>; --gcf-schrift: <Projektschrift>; }
```

Große Einheiten der Seite bekommen `data-review-anker="Name"`, damit
Anmerkungen daran hängen und in der Liste lesbar heißen.

## 7. Pflichten, die mitkommen

- **KI-Kennzeichnung (Art. 50 AI Act):** eingebaut — „KI“ auf dem Knopf, im
  Kopf, in der Begrüßung, über jeder Antwort. Nichts davon entfernen.
- **Einstufung:** KI-Hilfe = Chatbot, begrenztes Risiko; GrowCore ist
  Anbieter. Steht in DECISIONS des AI-OS, nicht je Projekt neu.
- **Datenschutzerklärung** des Projekts nennt: Speicherung der Anmerkungen und
  KI-Fragen im Projektraum (Supabase Frankfurt, KI-Fragen 30 Tage), Vertex AI
  (Google, EU-Multiregion), Zweck „Abstimmung während der Entwicklung“.
- **Zum Livegang ausschalten:** `FEEDBACK` entfernen, neu deployen. Der Eingang
  behält die Anmerkungen.

## 8. Prüfen

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<seite>/api/feedback/anmerkungen   # 200 (an) / 404 (aus)
```

Dann im Browser eine Anmerkung setzen und im Projektraum unter „Eingang“ bzw.
per MCP `feedback_eingang(aios_slug)` wiederfinden (Pflichtkern 8: einmal echt
auslösen).

## 9. Updates

Neuer Tag im Paket → in jedem Einbau `npm i "git+https://…#vX.Y.Z"`. Einbauten
stehen in der Projektkarte `growcore-feedback` im AI-OS.
