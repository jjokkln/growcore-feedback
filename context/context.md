# @growcore/feedback — Code-Kontext

> Wegweiser für Agenten: wie der Code gebaut ist und wo man was anfasst.
> Stand, offene Aufgaben und Funktionen stehen im AI-OS
> (`10_Projects/growcore-feedback/`, lädt als Steckbrief beim Start). Höchstens 15 KB.

## Was das ist

Ein npm-Paket (privat, aus dem öffentlichen GitHub-Repo installiert): das Feedback-Werkzeug für
GrowCore-Projekte in Entwicklung. Zwei Teile: Anmerkungen in beide Richtungen (Kunde kritzelt
und kommentiert, GrowCore setzt Hinweise und Fragen) und ein KI-Assistent unten rechts mit
Führung. Das Paket speichert nichts selbst. Alles geht über eine Route der Kunden-App an den
Feedback-Eingang des Projektraums (lennys-projekte.de), dort läuft auch die KI.

## Ich will … → Datei

| Ich will … | Schau in |
| --- | --- |
| das Overlay (Kommentar, Einkreisen, Antworten) ändern | `src/react/overlay.tsx` (groß, rund 98 KB), Hilfen in `src/react/ziehen.ts`, `bild.ts`, `umgebung.ts` |
| den KI-Assistenten (Fenster, Verlauf, Daumen) ändern | `src/react/ki-hilfe.tsx`, `src/react/einwilligung.ts` |
| die Führung („klick hier“) ändern | `src/react/fuehrung.tsx`, `src/react/ziel-finden.ts`, `src/core/ziele.ts` |
| den `?`-Knopf oder die Leiste ändern | `src/react/knopf.tsx`, `src/react/einstieg.ts`, `src/next/mount.tsx` |
| das Aussehen ändern | `src/styles/feedback.css` (Klassen `gcf-*`, Variablen `--gcf-*`) |
| eine Server-Route hinzufügen oder ändern | `src/next/route.ts`, Eingabeprüfung in `src/core/typen.ts` (zod) |
| ändern, wohin gespeichert wird | `src/next/eingang.ts` (Leitung zum Projektraum), `src/next/speicher.ts` (Schnittstelle `FeedbackSpeicher`) |
| den Wissenstext oder die Klickziele einer Seite verstehen | `src/next/anweisungen.ts`, `src/core/ziele.ts`; im Kundenprojekt `content/ki-wissen.ts` |
| Anmerkungen an Elementen verankern | `src/core/anker.ts` (`data-review-anker`) |
| gekritzelte Kreise glätten | `src/core/form.ts` |
| den Export als Markdown ändern | `src/core/export.ts` |
| die Rückfragen bei knappen Anmerkungen ändern | `src/core/nachfrage.ts`, Route `/nachfrage` in `src/next/route.ts` |
| die Fassung ohne Next ändern | `src/standalone/index.tsx`, `src/node/index.ts`, Bau mit `scripts/standalone.mjs` |
| eine neue Version herausgeben | `version` in `package.json`, Eintrag unter „Änderungen“ in `INSTALL.md`, Commit, Tag `vX.Y.Z`, pushen |
| das Paket in einem Kundenprojekt einbauen oder hochziehen | `INSTALL.md` (Schritte 1 bis 8, Abschnitt 9) |
| testen | `test/*.test.ts` · Befehle unten |

## Aufbau auf einer Seite

- **Stack:** TypeScript, ES-Module, `tsc` baut nach `dist/` (nicht im Repo). React und Next sind Peer-Abhängigkeiten. Laufzeit: `zod` (nur Server-Seite) und `html-to-image` (Bild der Stelle, wird erst beim Speichern geladen). `esbuild` baut die eigenständige Fassung.
- **Zugriffspunkte (`exports`):** 6: `.` (Kern, framework-frei), `./react` (Overlay, Knopf, KI-Hilfe), `./next` (Route und Layout-Bausteine), `./node` (Route für Express oder `@vercel/node`, dazu `standaloneSkript()`), `./styles.css`, `./standalone/gcf.js`.
- **Ordner:**
  - `src/core/` — Typen, Verankerung, Export, Zielkatalog, Antwort-Parser. Kein Server-Import. `konstanten.ts` ist bewusst ohne zod, damit der Browser-Teil klein bleibt, `typen.ts` bringt zod dazu.
  - `src/react/` — Client-Komponenten (alle `"use client"`), `lader.tsx` lädt sie erst im Browser nach.
  - `src/next/` — Server: `route.ts`, `eingang.ts`, `speicher.ts`, `bremse.ts`, `anweisungen.ts`, `mount.tsx`.
  - `src/node/`, `src/standalone/` — Fassung ohne Next.
  - `standalone/gcf.js` — gebautes Bündel (300 KB), liegt **im Repo**, damit ein Einbau ohne eigenen Build es ausliefern kann.
- **Route (`/api/feedback/*`):** `status` (GET, ohne Anmeldung), `anmerkungen` (GET, POST, PATCH, DELETE, mit Antworten und Erledigt), `personen`, `assistent` (KI, gestreamt), `ideen`, `ki-bewertung`, `nachfrage`. Ohne `FEEDBACK=1` antwortet sie überall 404.
- **Datenfluss:** Overlay im Browser → eigene Route der Kunden-App → `eingang.ts` mit `GROWCORE_FEEDBACK_KEY` (nur Server) → Projektraum. Den Schlüssel bekommt der Browser nie. Eine Bremse je Besucher in `bremse.ts` (im Speicher der Instanz), die harte Grenze je Projekt zieht der Projektraum.
- **Marken im Dokument:** Gespeichert wird ein Element plus Anteil in seiner Box, nie Pixel (`src/core/anker.ts`).
- **Rollen:** Kunde (Farben rot und grün), Agentur (Blau, Vorname aus dem Zugang). Kein Konto, nur eine Zufallskennung im Browser (`gcf-autor`), die erst beim ersten Schreiben entsteht.
- **Schalter (Umgebung des Kundenprojekts):** `FEEDBACK=1` an, `KI_HILFE=1` KI und Rückfragen, `FEEDBACK_BILD=0` Bild aus, `GROWCORE_FEEDBACK_KEY` Schlüssel, `GROWCORE_FEEDBACK_URL` anderer Eingang (Standard lennys-projekte.de).

## Regeln, die nie gebrochen werden

- Immer auf einen Tag festnageln, nie auf `main`. Ein neuer Tag erreicht ein Projekt erst, wenn dort `npm i` mit dem neuen Tag läuft.
- Der Schlüssel `gcf_…` gehört nie in den Browser und nie ins Repo.
- Die KI-Kennzeichnung („KI“ auf Knopf, Kopf, Begrüßung, jeder Antwort) nicht entfernen (Art. 50 AI Act).
- `EINWILLIGUNG_STAND` in `src/react/einwilligung.ts` ändern, sobald sich ändert, was mit den Daten der KI-Fragen passiert. Dann stimmen alle Personen neu zu.
- Die KI darf nur auf Kennungen aus dem Katalog zeigen, nie auf Selektoren. Neue Funktion im Projekt: ihre Knöpfe in den Zielkatalog aufnehmen.
- Das Bild der Stelle nie in Apps mit Personendaten (dort `datensparsam`).
- Schnittstellen des Paketes sind Vertrag mit dem Projektraum (Schema dort). Was hier durchkommt, darf dort nicht scheitern.
- Neue Felder an `FeedbackSpeicher` optional halten, ältere Sammelstellen laufen sonst nicht mehr.

## Befehle

```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test test/*.test.ts (Server-Route, Typen, Parser, Assistent)
npm run build       # tsc, dann die eigenständige Fassung nach standalone/gcf.js
npm run standalone  # nur die eigenständige Fassung
```

Einbinden in ein Projekt: `npm i "git+https://github.com/jjokkln/growcore-feedback.git#vX.Y.Z"`. `dist/` entsteht beim Installieren über `prepare`. Prüfung im Projekt: `curl -s -o /dev/null -w "%{http_code}\n" https://<seite>/api/feedback/anmerkungen` (200 an, 404 aus).

## Themen-Dateien

| Datei | Inhalt |
| --- | --- |
| `README.md` | Kurzbeschreibung, die vier Importpfade, Befehle |
| `INSTALL.md` | Einbauanleitung: Schlüssel, Umgebung, Route, Wissen und Ziele, Layout, Pflichten, Prüfen, Updates, Projekte mit Personendaten, Fassung ohne Next. Am Ende die Liste „Änderungen“ je Version, die ist Verlauf |

## Unklar

- Welche Projekte welche Version eingebaut haben, steht nicht im Repo, sondern in der Projektkarte im AI-OS.
- `README.md` nennt als Test nur „Server-Route“, es liegen 9 Testdateien in `test/`. Welche davon aktuell grün sind, nicht ausgeführt.
- Das Schema des Eingangs (`lennys-projekte` `src/lib/feedback/schema.ts`) liegt in einem anderen Repo und wurde nicht geprüft.
- Wie `standalone/gcf.js` zu `package.json` `version` passt (wann zuletzt gebaut), nicht geprüft.
