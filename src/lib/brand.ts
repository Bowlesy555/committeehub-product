// Everything that differs between one committee's deployment and the next
// is read here, from environment variables, and nowhere else. A new
// deployment is new env vars -- never a code edit. (If this ever becomes a
// shared multi-tenant app, only this file's source changes: an
// organisation's row instead of the environment.)
//
// Each variable is spelled out in full because Next.js inlines
// NEXT_PUBLIC_* values into the browser bundle by literal name.

export const PRODUCT_NAME = "CommitteeHub";

const DEFAULT_ACCENT = "#2E6F5C";

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

// A colour as #RRGGBB. The # is optional because an unquoted # starts a
// comment in a .env file, which silently empties the value.
function hex(v: string | undefined): string | null {
  const m = clean(v).match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1]}` : null;
}

const orgName = clean(process.env.NEXT_PUBLIC_ORG_NAME);
const accentEnv = hex(process.env.NEXT_PUBLIC_BRAND_ACCENT);
const iconBase = clean(process.env.NEXT_PUBLIC_BRAND_ICON_BASE_URL).replace(/\/+$/, "");

export const brand = {
  orgName,
  // Free text, so a committee can have "Riverside CommitteeHub",
  // "CommitteeHub Riverside" or a name of its own entirely.
  appName:
    clean(process.env.NEXT_PUBLIC_APP_NAME) || (orgName ? `${orgName} ${PRODUCT_NAME}` : PRODUCT_NAME),
  // Shown under a phone's home-screen icon, where long names get cut off.
  shortName: clean(process.env.NEXT_PUBLIC_APP_SHORT_NAME) || PRODUCT_NAME,
  description: "Committee spaces, decisions, tasks and skills",
  accent: accentEnv ?? DEFAULT_ACCENT,
  hasCustomAccent: accentEnv !== null,
  accentDark: hex(process.env.NEXT_PUBLIC_BRAND_ACCENT_DARK),
  logoUrl: clean(process.env.NEXT_PUBLIC_BRAND_LOGO_URL) || null,
  // For a logo with an opaque white background, which needs a white badge
  // behind it rather than sitting directly on the topbar.
  logoBadge: clean(process.env.NEXT_PUBLIC_BRAND_LOGO_BADGE) === "true",
  icons: {
    icon192: `${iconBase}/icon-192.png`,
    icon512: `${iconBase}/icon-512.png`,
    maskable512: `${iconBase}/icon-512-maskable.png`,
    appleTouch: `${iconBase}/apple-touch-icon.png`,
  },
};

// Optional parts of the app, off unless a deployment turns them on.
export const features = {
  // Calendar > Import action items. On for everyone with the standard
  // layout; "false" turns it off. Calibrated per committee against their own
  // minutes template with NEXT_PUBLIC_MINUTES_IMPORT_PROFILE.
  minutesImport: clean(process.env.NEXT_PUBLIC_FEATURE_MINUTES_IMPORT) !== "false",
  // The "Email link" tab on the sign-in page. Only worth showing once the
  // Supabase project has a real SMTP sender set up.
  emailLinkSignIn: clean(process.env.NEXT_PUBLIC_FEATURE_EMAIL_LINK) === "true",
};

// ---- theme ------------------------------------------------------------

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

function mix(a: string, b: string, amountOfB: number): string {
  const [ra, rb] = [toRgb(a), toRgb(b)];
  return toHex(ra.map((c, i) => c + (rb[i] - c) * amountOfB) as Rgb);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Text on top of the accent: whichever of white / near-black contrasts more.
function inkFor(hex: string): string {
  const l = luminance(hex);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#FFFFFF" : "#0A1712";
}

/**
 * CSS overriding globals.css's accent tokens with this deployment's colour,
 * or null when it uses the default. The soft/strong shades and the dark-mode
 * set are derived from the one accent so a committee only supplies one colour.
 */
export function brandThemeCss(): string | null {
  if (!brand.hasCustomAccent) return null;
  const light = brand.accent;
  const dark = brand.accentDark ?? mix(light, "#FFFFFF", 0.45);
  const tokens = (accent: string, soft: string, strong: string) =>
    `--accent:${accent};--accent-ink:${inkFor(accent)};--accent-soft:${soft};--accent-strong:${strong};`;
  return (
    `html:root{${tokens(light, mix(light, "#FFFFFF", 0.84), mix(light, "#000000", 0.32))}}` +
    `@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){` +
    `${tokens(dark, mix(dark, "#12160F", 0.72), mix(dark, "#FFFFFF", 0.35))}}}`
  );
}
