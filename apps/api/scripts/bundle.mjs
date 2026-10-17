// This step bundles each server entry point (dist/main.js and dist/migrate.js) into one file, as the
// NestJS serverless guide recommends. A bundle needs no node_modules folder at run time, so the
// Docker image copies only dist/ and drizzle/. Node does not let a CommonJS package (such as
// @nestjs/throttler) require() the ES module build of Nest in every setup, and the bundle avoids it.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
// The source, not the build output, so this step does not depend on the build order.
const sharedEntry = fileURLToPath(
  new URL('../../../packages/shared/src/index.ts', import.meta.url),
);

await build({
  absWorkingDir: apiRoot,
  entryPoints: ['dist/main.js', 'dist/migrate.js'],
  outdir: 'dist',
  allowOverwrite: true,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // Nest, Better Auth and pg load these only when an app uses them, and this API does not.
  external: [
    '@nestjs/graphql',
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@nestjs/websockets',
    '@nestjs/websockets/*',
    'class-transformer',
    'class-validator',
    'pg-native',
  ],
  // CommonJS code in the bundle still calls require() and reads __dirname and __filename.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join('\n'),
  },
  sourcemap: true,
  logLevel: 'warning',
  plugins: [
    {
      name: 'inline-minstrel-shared',
      setup(builder) {
        builder.onResolve({ filter: /^@minstrel\/shared$/ }, () => ({
          path: sharedEntry,
        }));
      },
    },
    {
      // Better Auth loads express and qs through createRequire(import.meta.url), which
      // esbuild cannot follow, so the bundle would leave them out. A plain require() call
      // lets esbuild put them in the bundle.
      name: 'bundle-better-auth-requires',
      setup(builder) {
        builder.onLoad(
          {
            filter:
              /[\\/]@thallesp[\\/]nestjs-better-auth[\\/]dist[\\/]index\.mjs$/,
          },
          async (args) => {
            const source = await readFile(args.path, 'utf8');
            const contents = source
              .replace(
                /^const require\$\d+ = createRequire\(import\.meta\.url\);$/gm,
                '',
              )
              .replace(/\brequire\$\d+\(/g, 'require(');
            if (contents.includes('createRequire(import.meta.url)')) {
              throw new Error(
                `Update the bundle-better-auth-requires plugin for ${args.path}`,
              );
            }
            return { contents, loader: 'js' };
          },
        );
      },
    },
  ],
});

// The Docker image copies dist/* without the API package.json. This file tells Node that the
// bundles are ES modules.
await writeFile(
  new URL('../dist/package.json', import.meta.url),
  '{"type":"module"}\n',
);
