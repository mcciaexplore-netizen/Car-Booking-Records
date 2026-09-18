import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('work', { recursive: true });
await build({
  entryPoints: ['tests/harness.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'work/fleet-tests.mjs',
  define: { 'import.meta.env.DEV': 'false' },
  plugins: [
    {
      name: 'test-only-platform-adapters',
      setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: 'runtime',
          namespace: 'test',
        }));
        b.onResolve({ filter: /^next\/headers$/ }, () => ({
          path: 'headers',
          namespace: 'test',
        }));
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: 'navigation',
          namespace: 'test',
        }));
        b.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({
          contents:
            args.path === 'runtime'
              ? `export const env=new Proxy({}, {get:(_,k)=>globalThis.TEST_ENV[k]});`
              : args.path === 'headers'
                ? `export async function headers(){return globalThis.TEST_HEADERS;}`
                : `export function redirect(){throw Error('Unexpected test redirect');}`,
          loader: 'js',
        }));
      },
    },
  ],
});
