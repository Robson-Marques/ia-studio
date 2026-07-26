/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // `brand` é a cor de ação do padrão ANTIGO (usada como text-brand,
        // bg-brand/5, border-brand nas telas que ainda não migraram). Passou a
        // apontar para o accent do Studio UX em vez de índigo cravado: senão o
        // painel fica com duas cores de ação convivendo — a do DS nas telas
        // migradas e o índigo nas outras.
        //
        // `<alpha-value>` é o mecanismo do Tailwind para `bg-brand/5` funcionar
        // com uma cor vinda de CSS var; por isso os tokens do DS expõem também
        // a variante `-rgb` (canais crus, sem `rgb()` em volta).
        brand: {
          DEFAULT: 'rgb(var(--su-action-rgb, 99 102 241) / <alpha-value>)',
          light:   'rgb(var(--su-action-hover-rgb, 129 140 248) / <alpha-value>)',
          dark:    'rgb(var(--su-action-active-rgb, 79 70 229) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
