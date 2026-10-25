/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 相対パスで出力し、どのフォルダに配置しても動くようにする
export default defineConfig({
  base: './',
  plugins: [react()],
  // 少し古い iPhone（iOS 14 以降）の Safari でも動くように変換する
  build: { target: ['es2020', 'safari14'] },
  server: { host: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
