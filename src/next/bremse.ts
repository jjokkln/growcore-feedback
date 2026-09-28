/**
 * Eine Bremse je Besucher, im Speicher der Serverless-Instanz.
 *
 * Bewusst einfach: Die harte Grenze je PROJEKT zieht der Eingang (300
 * Schreibvorgänge, 600 KI-Fragen je Stunde). Diese hier hält einen einzelnen
 * Besucher davon ab, das ganze Projektkontingent zu verbrauchen. Dass eine
 * neue Instanz bei null beginnt, ist hinnehmbar — sie schützt vor dem
 * Skript in der Schleife, nicht vor einem verteilten Angriff.
 */
const zaehler = new Map<string, number[]>();

export function bremse(schluessel: string, max: number, fensterMs: number): boolean {
  const jetzt = Date.now();
  const frisch = (zaehler.get(schluessel) ?? []).filter((t) => jetzt - t < fensterMs);
  if (frisch.length >= max) {
    zaehler.set(schluessel, frisch);
    return false;
  }
  frisch.push(jetzt);
  zaehler.set(schluessel, frisch);
  if (zaehler.size > 5000) {
    for (const [k, v] of zaehler) if (!v.some((t) => jetzt - t < fensterMs)) zaehler.delete(k);
  }
  return true;
}

export function besucherKennung(request: Request): string {
  const weitergeleitet = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return weitergeleitet || request.headers.get("x-real-ip") || "unbekannt";
}
