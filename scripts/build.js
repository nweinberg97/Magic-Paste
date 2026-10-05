// Builds the extension into dist/.
//   node scripts/build.js           one-off build
//   node scripts/build.js --watch   rebuild on change (reload the extension in chrome://extensions)
//   node scripts/build.js --serve   build, watch and serve the playground at http://localhost:5173
import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');
const outdir = 'dist';

const STATIC = [
  ['public', outdir],
  ['src/popup/popup.html', `${outdir}/popup.html`],
  ['src/playground/playground.html', `${outdir}/playground.html`],
  ['src/testkit/testkit.html', `${outdir}/testkit.html`],
  ['src/site/index.html', `${outdir}/index.html`],
];

async function copyStatic() {
  for (const [from, to] of STATIC) await cp(from, to, { recursive: true });
}

const copyStaticPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(async (result) => {
      if (!result.errors.length) await copyStatic();
    });
  },
};

const options = {
  entryPoints: [
    { in: 'src/content/index.ts', out: 'content' },
    { in: 'src/background/index.ts', out: 'background' },
    { in: 'src/popup/popup.ts', out: 'popup' },
    { in: 'src/popup/popup.css', out: 'popup' },
    { in: 'src/playground/playground.ts', out: 'playground' },
    { in: 'src/playground/playground.css', out: 'playground' },
    { in: 'src/testkit/testkit.ts', out: 'testkit' },
    { in: 'src/testkit/testkit.css', out: 'testkit' },
    { in: 'src/site/site.css', out: 'site' },
  ],
  outdir,
  bundle: true,
  format: 'iife', // content scripts can't be ES modules; one format keeps things simple
  target: 'chrome120',
  minify: !watch && !serve,
  sourcemap: watch || serve ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  plugins: [copyStaticPlugin],
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

if (watch || serve) {
  const context = await esbuild.context(options);
  await context.watch();
  if (serve) {
    const { port } = await context.serve({ servedir: outdir, port: 5173 });
    console.log(`\n  Site:       http://localhost:${port}/\n  Playground: http://localhost:${port}/playground.html\n`);
  }
} else {
  await esbuild.build(options);
}
