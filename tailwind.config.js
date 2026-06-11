/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ember semantic tokens (CSS variables from globals.css)
        bg: 'var(--bg)',
        rail: 'var(--rail)',
        elev: 'var(--elev)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
        ink: { DEFAULT: 'var(--text)', dim: 'var(--text-dim)', faint: 'var(--text-faint)' },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          glow: 'var(--accent-glow)',
          ink: 'var(--accent-ink)',
        },
        bubble: {
          in: 'var(--bubble-in)',
          out: 'var(--bubble-out)',
          'out-ink': 'var(--bubble-out-text)',
        },
        online: 'var(--status-online)',
        warn: 'var(--warn)',
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        // legacy palette, being phased out
        pulse: {
          50: 'var(--pulse-50)',
          100: 'var(--pulse-100)',
          200: 'var(--pulse-200)',
          300: 'var(--pulse-300)',
          400: 'var(--pulse-400)',
          500: 'var(--pulse-500)',
          600: 'var(--pulse-600)',
          700: 'var(--pulse-700)',
          800: 'var(--pulse-800)',
          900: 'var(--pulse-900)',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'em-sm': '10px',
        'em-md': '16px',
        'em-lg': '22px',
        'em-xl': '30px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-left': 'slideLeft 0.3s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
