import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('work', { recursive: true });
await build({
  entryPoints: ['tests/platform-harness.ts'],
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  outfile: 'work/platform-tests.mjs',
  plugins: [
    {
      name: 'request-context-only',
      setup(b) {
        b.onResolve({ filter: /^next\/(headers|navigation)$/ }, (args) => ({
          path: args.path,
          namespace: 'context',
        }));
        b.onLoad({ filter: /.*/, namespace: 'context' }, (args) => ({
          loader: 'js',
          contents: args.path.endsWith('headers')
            ? 'export async function headers(){return globalThis.PLATFORM_HEADERS ?? new Headers();}'
            : 'export function redirect(path){throw new Error("Redirect: "+path);}',
        }));
      },
    },
  ],
});
