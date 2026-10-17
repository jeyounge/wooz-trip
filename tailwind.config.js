/** @type {import('tailwindcss').Config} */
// 색·서체·반경은 전부 CSS 변수(src/app/theme.css)에서 온다.
// 시안을 바꿀 때는 theme.css 의 값만 바꾼다.
export default {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--c-bg)',
        surface: 'var(--c-surface)',
        soft: 'var(--c-soft)',
        ink: 'var(--c-ink)',
        sub: 'var(--c-sub)',
        line: 'var(--c-line)',
        'line-strong': 'var(--c-line-strong)',
        cta: 'var(--c-cta)',
        'cta-ink': 'var(--c-cta-ink)',
        'cta-shadow': 'var(--c-cta-shadow)',
        accent: 'var(--c-accent)',
        'accent-soft': 'var(--c-accent-soft)',
        selected: 'var(--c-selected)',
        'selected-ink': 'var(--c-selected-ink)',
        tag: 'var(--c-tag)',
        'tag-ink': 'var(--c-tag-ink)',
        warn: 'var(--c-warn)',
        'warn-ink': 'var(--c-warn-ink)',
        ok: 'var(--c-ok)',
        mint: 'var(--c-mint)',
        sky: 'var(--c-sky)',
        peach: 'var(--c-peach)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: 'var(--r-card)',
        btn: 'var(--r-btn)',
      },
      boxShadow: {
        card: '0 4px 0 var(--c-line)',
        soft: '0 3px 0 var(--c-line)',
        cta: '0 4px 0 var(--c-cta-shadow)',
      },
      maxWidth: {
        app: '430px',
      },
    },
  },
  plugins: [],
};
