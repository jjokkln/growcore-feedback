# @growcore/feedback

Feedback-Werkzeug für GrowCore-Projekte in Entwicklung: Anmerkungen in beide
Richtungen (kommentieren, einkreisen, antworten, abhaken, Markdown-Export) und
eine KI-Hilfe. Alles landet im zentralen Eingang des Projektraums — die
Kunden-App speichert nichts selbst.

- `@growcore/feedback` — Typen, Verankerung, Export, Zielkatalog (framework-frei)
- `@growcore/feedback/react` — Overlay und KI-Hilfe (Client)
- `@growcore/feedback/next` — `feedbackRoute()` und `<FeedbackWerkzeug />` (Server)
- `@growcore/feedback/styles.css`

Einbau: [INSTALL.md](INSTALL.md). Herkunft und Entscheidungen stehen im
AI-OS (Projekt `growcore-feedback`).

```bash
npm test        # Server-Route: Schalter, Kennungen, Prüfung, Bremse
npm run build
```
