import { useEffect, ReactNode } from 'react';

interface ThemeProviderProps {
  theme: string;
  isDark: boolean;
  children: ReactNode;
}

/** ember accents; keys keep the legacy settingsStore values */
const accents: Record<string, string> = {
  orange: '#FF7A45', // ember — фирменный
  telegram: '#2AABEE', // sky
  purple: '#7C5CFF', // violet
  green: '#19C37D', // mint
  red: '#F25F8E', // rose
};

/** Legacy pulse-* palette for screens not yet migrated to tokens */
const themePalettes: Record<string, { h: number; s: number; l: number }> = {
  telegram: { h: 198, s: 100, l: 40 },
  green: { h: 122, s: 39, l: 49 },
  purple: { h: 262, s: 100, l: 65 },
  orange: { h: 18, s: 100, l: 63 },
  red: { h: 340, s: 85, l: 66 },
};

function generatePalette(base: { h: number; s: number; l: number }) {
  return {
    50: `${base.h} ${base.s}% 97%`,
    100: `${base.h} ${base.s}% 88%`,
    200: `${base.h} ${base.s}% 78%`,
    300: `${base.h} ${base.s}% 68%`,
    400: `${base.h} ${Math.max(base.s - 5, 0)}% 58%`,
    500: `${base.h} ${base.s}% ${base.l}%`,
    600: `${base.h} ${base.s}% ${Math.max(base.l - 10, 15)}%`,
    700: `${base.h} ${base.s}% ${Math.max(base.l - 20, 10)}%`,
    800: `${base.h} ${Math.max(base.s - 10, 20)}% ${Math.max(base.l - 30, 8)}%`,
    900: `${base.h} ${Math.max(base.s - 15, 20)}% ${Math.max(base.l - 38, 5)}%`,
  };
}

export function ThemeProvider({ theme, isDark, children }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;

    // ember tokens switch on data-theme
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.classList.toggle('dark', isDark);
    root.style.setProperty('--accent', accents[theme] || accents.orange);

    // Legacy pulse-* palette for not-yet-migrated screens
    const base = themePalettes[theme] || themePalettes.orange;
    const palette = generatePalette(base);
    for (const [shade, value] of Object.entries(palette)) {
      root.style.setProperty(`--pulse-${shade}`, `hsl(${value})`);
    }
  }, [theme, isDark]);

  return <>{children}</>;
}
