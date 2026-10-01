/** Die wenigen Zeichen des Werkzeugs, inline statt einer Icon-Bibliothek. */
type P = { size?: number };
const basis = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const Funken = ({ size }: P) => (
  <svg {...basis(size)}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
  </svg>
);
export const Pfeil = ({ size }: P) => (
  <svg {...basis(size)}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
export const Kreuz = ({ size }: P) => (
  <svg {...basis(size)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
export const Fadenkreuz = ({ size }: P) => (
  <svg {...basis(size)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
);
export const Info = ({ size }: P) => (
  <svg {...basis(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);
export const Start = ({ size }: P) => (
  <svg {...basis(size)}>
    <path d="M7 5l12 7-12 7z" />
  </svg>
);
export const Stift = ({ size }: P) => (
  <svg {...basis(size)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
  </svg>
);
/** Einklappen: Die Spitze zeigt, wohin das Fenster geht. */
export const Runter = ({ size }: P) => (
  <svg {...basis(size)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const Hoch = ({ size }: P) => (
  <svg {...basis(size)}>
    <path d="M18 15l-6-6-6 6" />
  </svg>
);
/** Der Einstieg in der Navigation — dasselbe Zeichen wie in Aghasadeh-Garage. */
export const Frage = ({ size }: P) => (
  <svg {...basis(size)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01" />
  </svg>
);
export const Haken = ({ size }: P) => (
  <svg {...basis(size)} strokeWidth={3}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
/** Griff zum Verschieben: sechs Punkte, wie überall. */
export const Griff = ({ size }: P) => (
  <svg {...basis(size)} fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);
