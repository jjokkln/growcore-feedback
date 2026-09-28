# AGENTS.md — GrowCore/growcore-feedback

Anweisungen für KI-Agenten (Cursor, Codex, Copilot, Claude Code) und für
Menschen, die in diesem Repository arbeiten. Der Block unten ist zentral
gepflegt und wird überschrieben — Projektspezifisches gehört darunter.

<!-- BEGIN:growcore-pflicht ffeffd4ff445 — generiert aus AI-OS/30_Knowledge/Rules-bei-Bedarf/pflichtkern.md, nicht von Hand ändern -->
## Pflichtkern GrowCore — nicht verhandelbar

Diese zwölf Punkte gelten in **jedem** Projekt, für **jeden** Agenten und jeden
Menschen, der hier Code schreibt. Sie sind keine Empfehlungen. Wer einen davon
nicht erfüllen kann, schreibt das auf, statt ihn stillschweigend zu übergehen.

Gilt für alles, was ein Kunde oder Besucher zu sehen bekommt — Marketing-Website,
Kundenportal, Admin-Dashboard, Konfigurator. Mit **(App)** markierte Punkte
gelten nur, wenn es Logins gibt.

**1. Alles läuft in der EU.** Supabase-Projekte immer in Frankfurt (`eu-central-1`),
Hosting Vercel, KI-Dienste mit Personenbezug nur in EU-Regionen (Muster:
`gemini-2.5-flash` @ `europe-west1`). Ein Projekt in London oder Virginia wird
umgezogen, nicht dokumentiert.
*Beweis:* Region im Supabase-Dashboard bzw. `get_project_url`, nicht die Erinnerung.

**2. Impressum und Datenschutzerklärung sind vorhanden und wahr.** Impressum nach
§ 5 DDG von jeder Seite in einem Klick erreichbar, Datenschutzerklärung nach
Art. 13 DSGVO, die **jeden real eingesetzten Dienst** nennt: Hosting, Datenbank,
Mailversand, Analytics, Karten, Schriften, KI. Keine Standardvorlage mit Diensten,
die nicht laufen, und ohne die, die laufen.
*Beweis:* die genannten Dienste gegen die echten Netzwerk-Requests halten.

**3. Vor der Einwilligung geht kein Request an einen Dritten.** Analytics, Karten,
YouTube, Social-Embeds, externe Schriften, Pixel — alles erst nach aktiver
Zustimmung (§ 25 TDDDG). „Ablehnen" hat dieselbe Größe, Schriftstärke und
Farbigkeit wie „Akzeptieren". Impressum und Datenschutz dürfen von keinem Dialog
verdeckt werden. Ein Widerruf muss erreichbar sein.
*Beweis:* Netzwerk-Mitschnitt im Browser, Zähler für Drittanbieter-Requests **auf 0**.
Nicht „der Code sieht richtig aus".

**4. Drei-Schritt-Regel: ein neuer Drittanbieter ändert drei Dinge im selben
Arbeitsschritt.** (1) die technische Stelle, (2) den Consent-/Banner-Text,
(3) die Datenschutzerklärung. Und er bekommt ein Einwilligungs-Gate, nicht nur
einen Absatz. Rechtstexte kennen weder Build noch Tests — hier wird nichts rot,
wenn man es vergisst. Genau das ist am 2026-07-30 passiert: Instagram, TikTok und
Facebook waren eingebettet, während die Erklärung „werden **nicht** eingebettet"
behauptete.

**5. Nichts wird erfunden.** Keine Testimonials ohne echten Absender, keine
unbelegten Mitgliedschaften oder Zertifikate, keine Zahl und kein Preis, den der
Kunde nicht freigegeben hat, keine Platzhalter-Adressen, keine Blindtexte.
**Eine Zahl im Kundentext ist eine Zusage.** Sie kommt vom Kunden oder sie kommt
nicht auf die Seite. Fehlt ein Inhalt, wird die Sektion entfernt, nicht gefüllt.

**6. Wo KI im Produkt läuft, steht es dran.** Risikoklasse (EU AI Act) und Rolle
(Anbieter oder Betreiber) **schriftlich vor der ersten Zeile Code**. Ein Chatbot
muss als KI erkennbar sein, **bevor** jemand tippt — das Wort „KI" muss fallen,
„Virtual Assistant" reicht nicht. Publizierte KI-Inhalte zu Themen von
allgemeinem Interesse bekommen die offiziellen EU-Zeichen, nie selbstgebaute
Hinweis-Pillen. Jede redaktionelle Tabelle bekommt ihr Offenlegungsfeld
(`ai_disclosure`) **beim Anlegen**, so wie RLS gleich mitkommt.
Gilt **nicht** dafür, dass mit Claude entwickelt wurde — nur für KI, die beim
Nutzer läuft.

**7. Die Seite ist ohne Maus bedienbar.** Volle Tastaturbedienung mit sichtbarem
Fokus, Kontrast 4,5:1, Alt-Texte, verknüpfte Formularbeschriftungen, genau eine
`<h1>` pro Seite, 175 % Schriftgröße ohne waagerechtes Scrollen. Dazu das
Barrierefreiheits-Panel (`@growcore/a11y`) und eine Seite `/barrierefreiheit` mit
erreichbarem Kontakt. Das Panel ist ein Komfort-Plus — es ersetzt die Arbeit am
Markup nicht.
*Beweis:* **ohne Anmeldung** `npx @axe-core/cli <url> --exit`. **Mit Anmeldung
`@axe-core/playwright`, nicht der CLI** — der kommt an keine Sitzung und deckt bei
einer Verwaltungsoberfläche nur `/login` und `/barrierefreiheit`, also genau die
Flächen, um die es nicht geht (Poisea, 2026-09-03). Playwright ins Scratchpad
installieren, nicht ins Kundenrepo. Beides **plus** Handprüfung: ein automatischer
Checker findet höchstens ein Drittel. Anleitung und die drei Fallen:
`30_Knowledge/Referenzen/playwright-axe.md`.

**8. Formulare fragen nur das Nötige und kommen an.** Datenschutzhinweis nach
Art. 13 direkt am Formular, nur Felder, die wirklich gebraucht werden. Und die
Strecke wurde **einmal echt ausgelöst**: abgeschickt → in der Datenbank →
Mail beim Kunden → Bestätigung beim Absender. Eine Website ohne funktionierende
Anfrage ist keine Lead-Maschine, sondern eine Broschüre.

**9. (App) Jede Tabelle hat RLS, und die Middleware wurde gemessen.** Der
anon-Key ist öffentlich — jede Tabelle bekommt explizite Minimal-Policies,
Migration und RLS im selben Commit. Server Actions und Routes prüfen zusätzlich
selbst `auth.getUser()`; die Middleware allein reicht nicht. Bei Next.js heißt
sie `proxy.ts` (Funktion `proxy()`) — eine `middleware.ts` ist **veraltet**: in
Next 16.1 läuft sie noch mit Deprecation-Warnung, beide Dateien nebeneinander
brechen den Build, und eine spätere Version kann sie fallen lassen. Bei einem
Projekt lag `/admin` live offen im Netz, weil niemand den Beweis geführt hatte.
*Beweis:* `curl -s -o /dev/null -w "%{http_code}" <geschützter-pfad>` plus die
Zeile `ƒ Proxy (Middleware)` im Build-Output. Getestet wird mit **jeder** Rolle,
einschließlich eines Zugangs ohne Berechtigung. Als Admin sieht immer alles
richtig aus. Ein leerer Zustand und eine fehlschlagende Policy sehen von außen
gleich aus — Zeilen **zählen**, nicht hinsehen.

**10. Kundendaten stehen an genau einer Stelle.** Firmenname, Anschrift, Telefon,
Mail, Registerangaben, Domain in einer Datei (`site-config.ts`), aus der sich
Kopfbereich, Fußbereich, Impressum, Datenschutz, Metadaten und strukturierte
Daten bedienen. Ändert sich eine Telefonnummer, ändert man sie einmal statt an
neun Stellen — und vergisst die zehnte nicht.

**11. (App) Fünf bekannte Auth-Fehler sind ausgeschlossen, nicht nur bedacht.**
Diese fünf tauchen in echten Projekten immer wieder auf und werden aktiv
geprüft, nicht nur beim Bauen im Kopf behalten:
1. Session-Token steht **nicht** in `localStorage`/`sessionStorage` — ein
   einziges XSS liest sonst die Session aus. Session gehört ins
   `httpOnly`-Cookie.
2. Admin-/Rollen-Check läuft **serverseitig**, nicht nur in einer
   `'use client'`-Komponente — ein clientseitiger Check ist im DevTools
   umgehbar und entscheidet nur über Sichtbarkeit, nie über Zugriff.
3. Signup ist verifiziert (E-Mail-Bestätigung, kein `mailer_autoconfirm` in
   Produktion) — sonst kann sich jeder als jemand anderes ausgeben, bevor der
   echte Inhaber es merkt. 2FA/OTP für sensible Rollen (Admin, Zahlungen).
4. Login- **und** Passwort-Reset-Endpoint haben Rate-Limiting — ohne das ist
   Brute-Force nur eine Frage der Zeit. Bei Supabase Auth die
   `[auth.rate_limit]`-Werte gegen die echte Anfragefrequenz prüfen, nicht nur
   die Sektion auf Existenz.
5. Passwortregeln (Mindestlänge/-komplexität) sind **serverseitig** bzw. in
   der Supabase-Auth-Konfiguration durchgesetzt — eine Zod-/Formularregel im
   Frontend ist reine UX und per direktem API-Call umgehbar.
*Beweis:* siehe Skill `security-audit`, Schritt 1b — dort steht je Punkt der
konkrete Grep/Check.

**12. Jede Handlung, die Daten verändert, hinterlässt eine Spur — und die Spur
wird gezählt, nicht geglaubt.** Der Satz „wer hat das geändert" wird **immer**
rückwirkend gestellt; wer erst dann anfängt aufzuzeichnen, hat die Antwort nicht
mehr. Drei Fälle, alle drei gemeint:

1. **Software mit Konten** bekommt ein Audit-Log mit vier Eigenschaften: Die
   Schreibfunktion liegt in einem **normalen Modul**, nicht in einem
   `'use server'`-Modul (sie schreibt mit Service-Role und wäre als Server
   Action ein offener Schreibkanal ins Protokoll — fremde Nutzer-Id, erfundene
   Aktion, fremder Mandant). Die Beschriftungstabelle ist über die Aktions-Union
   typisiert, sodass eine neue Aktion ohne Beschriftung ein **Typfehler** ist.
   Der Betroffene ist ein **Fremdschlüssel und ein Pflichtfeld** — ein Name im
   JSONB ist eine Namensgleichheit, keine Zuordnung. Und ein **Abdeckungstest**
   verlangt für jede schreibende Server-Funktion entweder einen Protokollaufruf
   oder einen **begründeten** Eintrag in einer Ausnahmeliste.
2. **Die Verwaltungsfläche einer Website zählt dazu**, auch wenn die Website
   selbst keine Konten hat. Genau dieser Fall wird übersehen — „ist ja nur eine
   Landingpage", während dort jemand Preise, Texte und Bilder ändert, die ein
   Kunde als Zusage liest.
3. **Handlungen von Besuchern ohne Konto** werden als Datensatz festgehalten,
   nicht als Mail: abgeschicktes Formular, erteilte oder widerrufene
   Einwilligung, hochgeladene Datei. Mit Zeitpunkt, mit dem, was gesendet wurde,
   und mit dem, was daraus folgte. **Eine Mail ist kein Nachweis** — sie kann
   verloren gehen, ist nicht abfragbar und nicht zählbar; und für eine
   Einwilligung verlangt Art. 7 Abs. 1 DSGVO ausdrücklich, dass man sie
   **nachweisen** kann.

⚠️ **Ein Protokoll über Menschen ist selbst eine Verarbeitung.** Es gehört mit
Zweck und Aufbewahrungsfrist in die Datenschutzerklärung, und es bekommt nur die
Felder, die es braucht. Standortdaten, IP-Adressen oder ganze Formularinhalte
„weil man sie gerade hat" sind derselbe Fehler wie ein zu langes Formular in
Punkt 8 — nur an einer Stelle, an die niemand mehr hinsieht.

⚠️ **Der Grund, warum dieser Punkt einen Test verlangt und die anderen nicht:**
Ein fehlender Protokolleintrag **macht nichts kaputt**. Kein Fehler, kein roter
Test, keine Warnung — dieselbe Klasse wie die Rechtstexte in Punkt 4. In einem
echten Projekt ist so die Wochenfreigabe eines Zeiterfassungssystems sechs
Monate lang ohne jede Zeile geblieben, also der Schritt, nach dem Geld fließt,
während die *Rücknahme* protokolliert wurde. Deshalb beim Bauen **paarweise**
prüfen: freigeben/zurücknehmen, sperren/entsperren, zuweisen/entziehen.
*Beweis:* `npm run test:audit-abdeckung` grün — und für den dritten Fall die
abgeschickte Probe in der Datenbank wiedergefunden, wie in Punkt 8.

---

**Vor Go-Live, in dieser Reihenfolge:** `/rechtscheck` (darf die Seite überhaupt
online — Punkte 1–7) → `/launch-check` (funktioniert und hält sie — Punkte 8–10
und 12) → `/security-audit` (Punkt 11, Auth gehärtet) → die Blueprint-Checkliste des
Projekttyps. Diese Skills prüfen nur und melden
„nicht verifiziert", wo sie nichts beweisen können; das ist die Bedingung dafür,
dass man ihrem grünen Haken glauben darf.

**Wenn du keine dieser Prüfungen ausführen kannst** (weil du nicht Claude Code
bist oder kein Zugriff auf das AI-OS hast): die Punkte gelten trotzdem. Schreib
in deine Antwort, welche du nicht verifizieren konntest, statt sie zu übergehen.
<!-- END:growcore-pflicht -->

## Projektspezifisch

_Noch nichts eingetragen. Hier gehört hin, was man von außen nicht sehen
kann: Eigenheiten des Stacks, bekannte Stolperfallen, lokale Abweichungen
vom Standard und warum. Ausführlich in `context/`._
