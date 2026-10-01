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
npm i "git+https://github.com/jjokkln/growcore-feedback.git#v0.4.0"
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

**Der Einstieg ist ein `?` in der Navigation. Das ist der Standard (seit v0.3.0).**
Solange niemand etwas anmerken will, schwebt nichts über der Seite. Ein Klick
auf das `?` öffnet die Leiste, ein zweiter schließt sie wieder. Vorbild ist
Aghasadeh-Garage.

```tsx
import { FeedbackKnopf } from "@growcore/feedback/next";

// in der Kopfleiste, neben den übrigen Icon-Knöpfen:
<FeedbackKnopf className="<Icon-Knopf-Klassen der Navigation>" />
```

- Derselbe Schalter wie `FeedbackWerkzeug`: Ohne `FEEDBACK=1` steht er nicht
  in der Seite.
- `className` übernimmt den Stil der Navigation. Fehlt sie, gilt
  `.gcf-frage-standard`: 32 px, transparent, in der Textfarbe der Leiste.
- ⚠️ **Auf jeder Breite sichtbar**, also **nicht** ins Handy-Menü, das man
  erst aufklappen muss. Sonst gibt es auf dem Handy keinen Einstieg.
- Ist kein Knopf eingebunden, erscheint unten links der Stift als Notbehelf,
  dazu „Einklappen“ in der Leiste. Mit Knopf gibt es beides nicht.
- Eine App mit eigener Rechteprüfung (z. B. nur für den Admin) nimmt
  `AnmerkungsKnopf` aus `@growcore/feedback/react`, mit **derselben**
  Bedingung wie das Overlay. Sonst zeigt der Knopf ins Leere.

Und das CSS nach dem eigenen, z. B. in `globals.css`:

```css
@import "@growcore/feedback/styles.css";
:root { --gcf-primaer: <Projektfarbe>; --gcf-schrift: <Projektschrift>; }
```

⚠️ Die `:root`-Überschreibung **nicht** in `@layer base` (oder einen anderen
Layer) legen: Das Paket-CSS liegt ungelayert, und ungelayertes CSS schlägt
jeden Layer — das Werkzeug bliebe in den Standardfarben. Gemessen beim ersten
Einbau (Straffälligenhilfe, 2026-09-28).

Bei `trailingSlash: true` antwortet `/api/feedback/…` ohne Schrägstrich mit
308; Browser folgen dem samt Methode und Inhalt, `curl` braucht `-L`.

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


## 10. Projekte mit Personendaten und Konten (seit v0.4.0)

Zeigen die Seiten Personendaten (Bewerber, Patienten, Mitarbeiter), darf **nichts**
davon in den zentralen Eingang im Projektraum wandern. Dann läuft das Werkzeug
gegen einen **eigenen Speicher in der eigenen Datenbank** und mit der **Identität
aus der Sitzung**:

```ts
export const { GET, POST, PATCH, DELETE } = feedbackRoute({
  ki: KI_WISSEN,
  speicher: meinSpeicher,                       // implementiert FeedbackSpeicher
  identitaet: async (request) => { /* Sitzung prüfen, Rolle prüfen, { ref, label } oder null */ },
});
```

```tsx
<FeedbackWerkzeug projekt="…" ziele={ZIELE}
  modus={{ datensparsam: true, ohneName: true, hinweis: "Keine Namen oder Bewerberdaten eintragen." }} />
```

- `identitaet` gibt `null` → **401 auf jeder Route**, auch Lesen und KI. Die Kopfzeilen
  `x-gcf-autor`/`x-gcf-name` des Browsers zählen dann nicht mehr.
- `FeedbackSpeicher` (`liste`, `anlegen`, `antworten`, `erledigt`, `loeschen`, optional
  `kiFrage`): Fehler als `EingangFehler(status, text)` werfen. Ohne `kiFrage` wird der
  Wortlaut einer KI-Frage nirgends festgehalten.
- `datensparsam`: Die Stellenbeschriftung kommt **nur** aus `data-review-anker` (sonst
  `#id` oder `<tag>`), nie aus Überschrift, `aria-label`, `alt` oder Text. Große
  Einheiten der Seite deshalb mit `data-review-anker="Name"` benennen.
- `ohneName`: kein Namensfeld, nichts im Browser gemerkt.
- `autorName` (seit v0.5.0): der Name aus dem Konto, steht fest im Kommentar- und
  Einkreisfeld („Als: …"). Nicht änderbar, weil der Server den Namen aus der Sitzung nimmt.
  Mit `ohneName` zusammen setzen; die App übergibt ihn im Layout aus dem Profil.
- Kein `GROWCORE_FEEDBACK_KEY` nötig. Das Projekt braucht keinen Eintrag im Projektraum.
- ⚠️ Der Anmerkungstext selbst bleibt Freitext. `hinweis` sagt, was nicht hineingehört;
  technisch verhindern lässt es sich nicht.
- ⚠️ Die KI-Hilfe schickt Fragen an Vertex AI (Google). Wer Fragen über Personen stellt,
  schickt sie dorthin. Das Wissen der KI (`KI_WISSEN`) enthält nur Beschreibung der
  Oberfläche, keine Daten.

## Änderungen

- **v0.7.0** (2026-10-01): **Zentraler Schalter je Projekt.** Die App fragt `GET /api/feedback/status` (neu in `feedbackRoute`); nur bei `{ an: true }` erscheinen `?`, Leiste und KI-Hilfe, sonst nichts — auch bei einem Fehler. Die Route fragt dafür `speicher.status()` (neu, optional, 30 s gemerkt); ist der Schalter aus, antwortet jeder andere Pfad 404. Der Standard-Speicher fragt die Sammelstelle (`/api/feedback/status` mit dem Schlüssel); kennt die Sammelstelle den Pfad nicht (404, ältere Fassung), gilt „an“. Ein eigener Speicher ohne `status()` ist immer „an“. Geschaltet wird im Projektraum auf `/feedback` bzw. in der Sammelstelle des Projekts. `FEEDBACK=1` bleibt die Voraussetzung: ohne ihn lädt die App kein Werkzeug und fragt auch nicht.
- **v0.6.0** (2026-10-01): Nach dem Speichern eines Kommentars oder Kreises springt die Leiste auf „Ansehen“ zurück. Die Leiste ist über ihren Griff (⋮⋮ links) verschiebbar, auch per Pfeiltasten; Doppelklick legt sie zurück nach unten in die Mitte. Zettel an Kreisen und das Kommentarfenster lassen sich ziehen (Fenster an der Kopfzeile), höchstens 220 px um ihre Marke, mit gestrichelter Linie zurück zur Stelle; Doppelklick auf den Griff im Fenster legt es zurück. Antworten sind an der Marke zu sehen (Punkt am Pin, „↳ Antwort von GrowCore“ am Zettel). Neue localStorage-Schlüssel `gcf-leiste-lage` und `gcf-versatz:<projekt>`, keine Änderung an API oder Speicher.
- **v0.5.0** (2026-09-29): Leiste zu = alles weg. Ist die Leiste über das `?` geschlossen, zeigt die Seite keine Punkte, keine Kreise und kein offenes Fenster mehr (vorher blieben sie sichtbar). Die Zahl am `?` zählt weiter. Neu `modus.autorName`: Name aus dem Konto fest im Feld.
- **v0.4.0** (2026-09-29): Eigener Speicher (`speicher`) und Identität aus der Sitzung (`identitaet`) für Projekte mit Personendaten; `modus` (`datensparsam`, `ohneName`, `hinweis`). Ohne diese Optionen verhält sich alles wie in v0.3.0.
- **v0.3.0** (2026-09-28): Der Einstieg ist ein `?` in der Navigation
  (`FeedbackKnopf` bzw. `AnmerkungsKnopf`), mit der Zahl offener Anmerkungen.
  Die Leiste ist anfangs zu, nichts schwebt. Ein Klick aufs `?` schließt sie
  in jedem Modus (auch beim Kommentieren) und setzt sie auf „Ansehen“ zurück.
  „Punkte“ und „Kreise“ sind entfernt. „Erledigte“ hat ein eigenes Kästchen.
  „Einklappen“ gibt es nur noch ohne Knopf. Die Leiste bricht am Schreibtisch
  nicht mehr um. Neuer localStorage-Schlüssel `gcf-leiste-offen` (Standard:
  zu), der alte `gcf-leiste-eingeklappt` wird nicht mehr gelesen.

- **v0.2.0** (2026-09-28): Eingeklappt nur noch ein Stift unten links in der
  Projektfarbe (`--gcf-primaer`), mit Zahl der offenen Anmerkungen. KI-Fenster
  bleibt bei „Zeigen“ offen und klappt über „Einklappen“ zu; auf dem Handy
  schrumpft es während der Führung. „Export“ heißt jetzt „Als Text kopieren“
  und steht in der Liste. Liste mit „Diese Seite / Alle Seiten“, ein Klick auf
  eine Anmerkung einer anderen Seite wechselt dorthin. Liste links statt rechts.
- **v0.1.0** (2026-09-28): erste Fassung.
