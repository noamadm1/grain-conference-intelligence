import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // נתיבים יחסיים — כדי שתיקיית dist תעבוד בגרירה ל-Netlify/Vercel או מכל תת-נתיב
  base: './',
})
