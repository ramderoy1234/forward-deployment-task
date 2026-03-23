/** @type {import('tailwindcss').Config} */
export default {
 content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
 theme: {
   extend: {
     fontFamily: {
       sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
     },
     animation: {
       'fade-in': 'fadeIn 0.2s ease-out',
       'slide-up': 'slideUp 0.25s ease-out',
     },
     keyframes: {
       fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
       slideUp: {
         from: { opacity: '0', transform: 'translateY(8px)' },
         to: { opacity: '1', transform: 'translateY(0)' },
       },
     },
   },
 },
 plugins: [
   function ({ addUtilities }) {
     addUtilities({ '.scrollbar-hide': { '-ms-overflow-style': 'none', 'scrollbar-width': 'none', '&::-webkit-scrollbar': { display: 'none' } } });
   },
 ],
};
