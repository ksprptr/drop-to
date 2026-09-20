/** The instance's accent: `APP_PRIMARY_COLOR` is the `600` hex; the `50`…`950` ramp is derived from it. */

/** Tailwind's `green-600`, the palette DropTo shipped with — used whenever the env is unset. */
const DEFAULT_PRIMARY_HEX = '#00a63e';

/** The shade `APP_PRIMARY_COLOR` stands for; every other shade is interpolated around it. */
const ANCHOR_SHADE = 600;

/** Per-shade lightness/chroma averaged over Tailwind's palettes — the ramp's shape; hue/saturation come from the hex. */
const REFERENCE_RAMP = {
  50: { lightness: 0.9772, chroma: 0.0177 },
  100: { lightness: 0.9504, chroma: 0.0416 },
  200: { lightness: 0.9055, chroma: 0.0802 },
  300: { lightness: 0.8405, chroma: 0.1347 },
  400: { lightness: 0.7535, chroma: 0.1894 },
  500: { lightness: 0.6827, chroma: 0.2141 },
  600: { lightness: 0.5978, chroma: 0.2129 },
  700: { lightness: 0.5149, chroma: 0.1874 },
  800: { lightness: 0.4461, chroma: 0.1545 },
  900: { lightness: 0.3946, chroma: 0.1238 },
  950: { lightness: 0.2779, chroma: 0.0877 },
} as const;

type Shade = keyof typeof REFERENCE_RAMP;

const SHADES = Object.keys(REFERENCE_RAMP).map(Number) as Shade[];

export interface PrimaryColor {
  /** The accent's `600` shade in hex — for everything that cannot read a CSS variable. */
  hex: string;
  /** `--app-primary-*` overrides for <html>, or `undefined` on the built-in green (globals.css falls back to it). */
  variables?: Record<string, string>;
}

/**
 * Parses `#rgb` / `#rrggbb` (the `#` optional) into 0–255 channels; `null` when it is not a hex.
 **/
function parseHex(value: string): [number, number, number] | null {
  const digits = value.trim().replace(/^#/, '').toLowerCase();

  if (!/^([\da-f]{3}|[\da-f]{6})$/.test(digits)) {
    return null;
  }

  const full = digits.length === 3 ? digits.replace(/./g, (char) => char + char) : digits;

  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/**
 * sRGB channel (0–255) → linear-light.
 **/
const toLinear = (channel: number): number => {
  const value = channel / 255;

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/**
 * sRGB → OKLCH (lightness 0–1, chroma, hue in degrees).
 **/
function rgbToOklch([r, g, b]: [number, number, number]) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const labA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    chroma: Math.hypot(labA, labB),
    hue: ((Math.atan2(labB, labA) * 180) / Math.PI + 360) % 360,
  };
}

const round = (value: number, decimals: number): number => Number(value.toFixed(decimals));

/**
 * Builds the `--app-primary-*` ramp around the hex: the reference curve gives each step's lightness/chroma, the hex the hue.
 **/
function buildRamp(rgb: [number, number, number]): Record<string, string> {
  const base = rgbToOklch(rgb);
  const anchor = REFERENCE_RAMP[ANCHOR_SHADE];
  const variables: Record<string, string> = {};

  for (const shade of SHADES) {
    const reference = REFERENCE_RAMP[shade];
    // Lightness slides from the configured shade towards whichever end of the ramp this step is on,
    // so `50` and `950` keep Tailwind's extremes no matter how light or dark the hex is.
    const end = REFERENCE_RAMP[shade < ANCHOR_SHADE ? 50 : 950];
    const progress =
      shade === ANCHOR_SHADE
        ? 0
        : (reference.lightness - anchor.lightness) / (end.lightness - anchor.lightness);
    const lightness = base.lightness + progress * (end.lightness - base.lightness);
    const chroma = (base.chroma * reference.chroma) / anchor.chroma;

    variables[`--app-primary-${shade}`] =
      `oklch(${round(Math.min(1, Math.max(0, lightness)), 4)} ${round(chroma, 4)} ${round(base.hue, 2)})`;
  }

  return variables;
}

/**
 * Turns a raw `APP_PRIMARY_COLOR` into the accent; a non-hex (or empty) value falls back to the built-in green.
 **/
export function resolvePrimaryColor(value: string | undefined): PrimaryColor {
  const rgb = value ? parseHex(value) : null;

  if (!rgb) {
    return { hex: DEFAULT_PRIMARY_HEX };
  }

  const hex = `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

  return hex === DEFAULT_PRIMARY_HEX ? { hex } : { hex, variables: buildRamp(rgb) };
}

/**
 * Renders a hex with an alpha (`0`–`1`) as `rgba()`, for renderers without CSS variables (Satori: icons, OG image).
 **/
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
