import type { Umgebung } from "../core/konstanten.ts";

/**
 * Was der Browser über sich selbst verrät, auf das Nötige verdichtet (0.17.0):
 * Gerät, Browser, Betriebssystem, Fenstergröße und die Adresse der Seite. Das
 * beantwortet bei jeder Anmerkung „am Handy oder am Rechner? Auf der Vorschau
 * oder live?“, ohne dass der Kunde das schreiben muss.
 *
 * Bewusst NICHT dabei: IP-Adresse, Sprache, Zeitzone, der volle User-Agent,
 * Kennungen. Das hier lässt sich nicht auf eine Person zurückführen.
 */

function version(ua: string, muster: RegExp): string {
  const treffer = ua.match(muster);
  return treffer?.[1]?.split(".")[0] ?? "";
}

export function browserName(ua: string): string {
  const mit = (name: string, muster: RegExp) => {
    const v = version(ua, muster);
    return v ? `${name} ${v}` : name;
  };
  if (/SamsungBrowser\//.test(ua)) return mit("Samsung Internet", /SamsungBrowser\/([\d.]+)/);
  if (/Edg(e|A|iOS)?\//.test(ua)) return mit("Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/);
  if (/OPR\/|Opera/.test(ua)) return mit("Opera", /OPR\/([\d.]+)/);
  if (/Firefox\/|FxiOS\//.test(ua)) return mit("Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/);
  if (/Chrome\/|CriOS\//.test(ua)) return mit("Chrome", /(?:Chrome|CriOS)\/([\d.]+)/);
  if (/Safari\//.test(ua)) return mit("Safari", /Version\/([\d.]+)/);
  return "unbekannt";
}

export function osName(ua: string, beruehrungspunkte: number): string {
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPod/.test(ua)) return "iOS";
  if (/iPad/.test(ua)) return "iPadOS";
  // Ein iPad meldet sich seit iPadOS 13 als Mac — mit Touch ist es keiner.
  if (/Macintosh/.test(ua)) return beruehrungspunkte > 1 ? "iPadOS" : "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "unbekannt";
}

export function geraetArt(ua: string, os: string): Umgebung["geraet"] {
  if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua))) return "handy";
  if (os === "iPadOS" || /Android/.test(ua) || /Tablet/.test(ua)) return "tablet";
  return "desktop";
}

export function ermittleUmgebung(): Umgebung {
  const ua = navigator.userAgent;
  const os = osName(ua, navigator.maxTouchPoints ?? 0);
  const html = document.documentElement;
  const dunkel =
    html.classList.contains("dark") ||
    html.dataset.theme === "dark" ||
    (!html.classList.contains("light") && html.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  return {
    host: location.host.slice(0, 200),
    geraet: geraetArt(ua, os),
    browser: browserName(ua),
    os,
    viewport_width: Math.min(8000, Math.max(200, Math.round(window.innerWidth))),
    viewport_height: Math.min(8000, Math.max(100, Math.round(window.innerHeight))),
    pixel_ratio: Math.round(Math.min(8, Math.max(0.5, window.devicePixelRatio || 1)) * 100) / 100,
    farbmodus: dunkel ? "dunkel" : "hell",
  };
}
