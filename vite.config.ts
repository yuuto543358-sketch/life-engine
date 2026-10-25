/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 相対パスで出力し、どのフォルダに配置しても動くようにする
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
