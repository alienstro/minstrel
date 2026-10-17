// Vercel runs the built API from the top folder of its function, but it leaves the
// workspace links (such as @minstrel/shared) at their repository paths, where Node does not
// look. This step puts our own workspace code inside dist/main.js. The bundle then imports
// only third-party packages, which the hoisted install keeps in the top node_modules folder.
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
// The source, not the build output, so this step does not depend on the build order.
const sharedEntry = fileURLToPath(new URL('../../../packages/shared/src/index.ts', import.meta.url));

await build({
  absWorkingDir: apiRoot,
  entryPoints: ['dist/main.js'],
  outfile: 'dist/main.js',
  allowOverwrite: true,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // Every bare import stays external, except the workspace package below.
  packages: 'external',
  sourcemap: true,
  logLevel: 'warning',
  plugins: [
    {
      name: 'inline-minstrel-shared',
      setup(builder) {
        builder.onResolve({ filter: /^@minstrel\/shared$/ }, () => ({ path: sharedEntry }));
      },
    },
  ],
});

// Vercel puts dist/* at the function root, away from the API package.json. This file tells
// Node that main.js is an ES module.
await writeFile(new URL('../dist/package.json', import.meta.url), '{"type":"module"}\n');
