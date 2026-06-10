import { useEffect, ReactNode } from 'react';

interface ThemeProviderProps {
  theme: string;
  isDark: boolean;
  children: ReactNode;
}

const themePalettes: Record<string, { h: number; s: number; l: number }> = {
  telegram: { h: 198, s: 100, l: 40 },
  green: { h: 122, s: 39, l: 49 },
  purple: { h: 262, s: 100, l: 65 },
  orange: { h: 36, s: 100, l: 50 },
  red: { h: 4, s: 75, l: 55 },
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

    // Apply dark mode
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Apply theme colors
    const base = themePalettes[theme] || themePalettes.telegram;
    const palette = generatePalette(base);
    for (const [shade, value] of Object.entries(palette)) {
      root.style.setProperty(`--pulse-${shade}`, `hsl(${value})`);
    }
  }, [theme, isDark]);

  return <>{children}</>;
}
