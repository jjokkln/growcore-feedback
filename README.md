# @growcore/feedback

Feedback-Werkzeug für GrowCore-Projekte in Entwicklung: Anmerkungen in beide
Richtungen (kommentieren, einkreisen, antworten, abhaken, als Text kopieren) und
einen KI-Assistenten. Alles landet im zentralen Eingang des Projektraums — die
Kunden-App speichert nichts selbst.

- `@growcore/feedback` — Typen, Verankerung, Export, Zielkatalog (framework-frei)
- `@growcore/feedback/react` — Overlay, `?`-Knopf und KI-Assistent (Client)
- `@growcore/feedback/next` — `feedbackRoute()`, `<FeedbackWerkzeug />` und `<FeedbackKnopf />` (Server)
- `@growcore/feedback/styles.css`

Seit v0.17.0 u. a.: Daumen unter KI-Antworten, Umgebung und optional ein Bild
an jeder Anmerkung, Rückfragen bei knappen Anmerkungen, `FEEDBACK` aus = kein
Werkzeug-Code in der Seite (siehe INSTALL.md, „Änderungen“).

Einbau: [INSTALL.md](INSTALL.md). Herkunft und Entscheidungen stehen im
AI-OS (Projekt `growcore-feedback`).

```bash
npm test        # Server-Route: Schalter, Kennungen, Prüfung, Bremse
npm run build
```
