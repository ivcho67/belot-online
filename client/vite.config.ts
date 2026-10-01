/**
 * File: vite.config.ts
 * Version: v1.1.0
 * Last Updated: 2026-09-26
 * Changes: Интеграция на @tailwindcss/vite за правилна обработка на Tailwind CSS v4 класовете в React компонентите.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});