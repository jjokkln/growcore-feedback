/**
 * Wann eine Anmerkung zu knapp ist, um sie zu verstehen (0.17.0). Dann bietet das
 * Overlay die Rückfragen der KI an, bevor gespeichert wird. Ohne zod, der
 * Browser braucht es.
 *
 * Knapp ist: weniger als 25 Zeichen, oder höchstens drei Wörter. „bild wechsel“,
 * „löschen“, „Überschrift verändern bitte“ sind knapp; „Das Foto ganz oben soll
 * durch das vom Sommerfest ersetzt werden“ nicht.
 */
export const KNAPP_ZEICHEN = 25;
export const KNAPP_WOERTER = 3;

export function istKnapp(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  return t.length < KNAPP_ZEICHEN || t.split(/\s+/).length <= KNAPP_WOERTER;
}
