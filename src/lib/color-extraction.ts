/**
 * Extract dominant brand color from a logo image using canvas-based k-means clustering.
 * Returns a hex color string like "#2563eb".
 */

export async function extractBrandColor(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 64; // downscale for speed
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        // Collect non-white, non-transparent pixels
        const pixels: [number, number, number][] = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          const a = data[i + 3]!;
          if (a < 128) continue; // skip transparent
          // skip near-white and near-black (common backgrounds)
          if (r > 240 && g > 240 && b > 240) continue;
          if (r < 15 && g < 15 && b < 15) continue;
          pixels.push([r, g, b]);
        }

        if (pixels.length === 0) {
          resolve("#2563eb"); // fallback blue
          return;
        }

        // Simple k-means with 5 clusters
        const k = Math.min(5, pixels.length);
        let centroids = pixels.slice(0, k).map((p) => [...p] as [number, number, number]);

        for (let iter = 0; iter < 10; iter++) {
          const groups: [number, number, number][][] = Array.from({ length: k }, () => []);
          for (const pixel of pixels) {
            let minDist = Infinity;
            let minIdx = 0;
            for (let c = 0; c < k; c++) {
              const dr = pixel[0] - centroids[c]![0];
              const dg = pixel[1] - centroids[c]![1];
              const db = pixel[2] - centroids[c]![2];
              const dist = dr * dr + dg * dg + db * db;
              if (dist < minDist) {
                minDist = dist;
                minIdx = c;
              }
            }
            groups[minIdx]!.push(pixel);
          }
          // Update centroids
          for (let c = 0; c < k; c++) {
            if (groups[c]!.length === 0) continue;
            centroids[c] = [
              Math.round(groups[c]!.reduce((s, p) => s + p[0], 0) / groups[c]!.length),
              Math.round(groups[c]!.reduce((s, p) => s + p[1], 0) / groups[c]!.length),
              Math.round(groups[c]!.reduce((s, p) => s + p[2], 0) / groups[c]!.length),
            ];
          }
        }

        // Pick the most colorful centroid (highest saturation)
        let bestColor = centroids[0]!;
        let bestSat = 0;
        for (const c of centroids) {
          const max = Math.max(c[0], c[1], c[2]);
          const min = Math.min(c[0], c[1], c[2]);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat > bestSat) {
            bestSat = sat;
            bestColor = c;
          }
        }

        const hex =
          "#" +
          bestColor.map((v) => v.toString(16).padStart(2, "0")).join("");
        resolve(hex);
      } catch {
        resolve("#2563eb");
      }
    };
    img.onerror = () => resolve("#2563eb");
    img.src = dataUrl;
  });
}

/**
 * Convert a hex color to CSS custom property values for full-page theming.
 * Generates light and dark variants for backgrounds, borders, and text.
 */
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Generate a full set of CSS variables from a brand color for complete page theming.
 */
export function generateBrandTheme(hex: string): Record<string, string> {
  const { h, s, l } = hexToHSL(hex);

  return {
    "--brand-color": hex,
    "--brand-50": `hsl(${h}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 40, 97)}%)`,
    "--brand-100": `hsl(${h}, ${Math.min(s + 5, 100)}%, ${Math.min(l + 35, 95)}%)`,
    "--brand-200": `hsl(${h}, ${s}%, ${Math.min(l + 25, 90)}%)`,
    "--brand-300": `hsl(${h}, ${s}%, ${Math.min(l + 15, 80)}%)`,
    "--brand-400": `hsl(${h}, ${s}%, ${Math.max(l + 5, 45)}%)`,
    "--brand-500": hex,
    "--brand-600": `hsl(${h}, ${Math.min(s + 5, 100)}%, ${Math.max(l - 10, 25)}%)`,
    "--brand-700": `hsl(${h}, ${Math.min(s + 5, 100)}%, ${Math.max(l - 20, 20)}%)`,
    "--brand-800": `hsl(${h}, ${Math.min(s + 3, 100)}%, ${Math.max(l - 30, 15)}%)`,
    "--brand-900": `hsl(${h}, ${Math.min(s + 3, 100)}%, ${Math.max(l - 40, 10)}%)`,
    "--brand-text": l > 55 ? "#1e293b" : "#ffffff",
    "--brand-text-muted": l > 55 ? "#64748b" : "rgba(255,255,255,0.8)",
    "--brand-bg": l > 55 ? "#ffffff" : "#0f172a",
    "--brand-bg-secondary": l > 55 ? "#f8fafc" : "#1e293b",
    "--brand-border": l > 55 ? `hsl(${h}, ${s}%, ${Math.min(l + 20, 92)}%)` : `hsl(${h}, ${s}%, ${Math.max(l - 15, 18)}%)`,
    // Tailwind primary overrides — makes all text-primary, bg-primary etc. use brand color
    "--primary": hex,
    "--primary-foreground": l > 55 ? '#1e293b' : '#ffffff',
    "--ring": hex,
    // Foreground overrides — ensures text is always readable on brand backgrounds
    "--foreground": '#1e293b',
    "--muted-foreground": '#64748b',
    "--card-foreground": '#1e293b',
    "--popover-foreground": '#1e293b',
    "--background": l > 55 ? '#ffffff' : '#ffffff',
    "--card": '#ffffff',
    "--muted": l > 55 ? '#f1f5f9' : '#f1f5f9',
    "--popover": '#ffffff',
    "--border": l > 55 ? `hsl(${h}, ${s}%, ${Math.min(l + 20, 92)}%)` : '#e2e8f0',
    "--input": l > 55 ? `hsl(${h}, ${s}%, ${Math.min(l + 20, 92)}%)` : '#e2e8f0',
  };
}
