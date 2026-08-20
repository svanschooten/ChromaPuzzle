// Color helpers shared by the splitter and the false-plate generator.

export const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const rgbCss = (t) => `rgb(${t[0]}, ${t[1]}, ${t[2]})`;

function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => clamp255((v + m) * 255));
}

const rand = (min, max) => min + Math.random() * (max - min);

/** Shift a plate tint just far enough to look plausible but reconstruct wrong. */
export function driftTint(tint) {
  const hsl = rgbToHsl(tint);
  hsl.h = (((hsl.h + rand(-20, 20)) % 360) + 360) % 360;
  hsl.s = clamp01(hsl.s * rand(0.7, 1.3));
  hsl.l = clamp01(hsl.l * rand(0.85, 1.15));
  // A fully desaturated or black template would drift into an invisible plate.
  if (hsl.l < 0.15) hsl.l = 0.15 + Math.random() * 0.1;
  return hslToRgb(hsl);
}
