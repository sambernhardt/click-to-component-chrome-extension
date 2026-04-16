const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/background.js'],
  bundle: true,
  outfile: 'background.js',
  platform: 'browser',
  target: ['chrome120'],
  format: 'iife',
};

if (watch) {
  esbuild.context(config).then(ctx => {
    ctx.watch();
    console.log('[ctc] watching src/background.js...');
  });
} else {
  esbuild.build(config).then(() => {
    console.log('[ctc] built background.js');
  }).catch(() => process.exit(1));
}
