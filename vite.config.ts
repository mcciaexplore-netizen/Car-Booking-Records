import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const resolvePackage = createRequire(import.meta.url).resolve;

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^tailwindcss$/,
        replacement: resolvePackage('tailwindcss/index.css'),
      },
      {
        find: /^tw-animate-css$/,
        replacement: fileURLToPath(
          new URL(
            './node_modules/tw-animate-css/dist/tw-animate.css',
            import.meta.url,
          ),
        ),
      },
      {
        find: /^shadcn\/tailwind.css$/,
        replacement: resolvePackage('shadcn/tailwind.css'),
      },
    ],
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [vinext(), nitro()],
});
