// node render-all.js            -> renders every design in designs/ to renders/NN-name.mp4 + NN-name_cover.png
// node render-all.js 05 12      -> only those designs
// 30 fps, 300 frames (10 s), libx264 veryfast crf 18, yuv420p, +faststart, no audio. Cover = frame at t=9.
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const path = require('path'), fs = require('fs');
const ROOT = __dirname, DESIGNS = path.join(ROOT, 'designs'), OUT = path.join(ROOT, 'renders');
const FPS = 30, FRAMES = 300, COVER_T = 9, WORKERS = parseInt(process.env.WORKERS || '4', 10);
const all = fs.readdirSync(DESIGNS).filter(n => /^\d\d-/.test(n)).sort();

async function renderOne(name) {
  const dir = path.join(DESIGNS, name);
  const bundle = path.join(dir, 'main.js');
  if (fs.existsSync(bundle)) spawnSync('npx', ['esbuild', 'main.js', '--bundle', '--minify', '--outfile=bundle.js'], { cwd: dir, stdio: 'ignore' });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error(name, 'PAGEERR', e.message));
  await page.addInitScript(() => { window.__RENDER_MODE = true; });
  await page.goto('file://' + path.join(dir, 'index.html'));
  await page.waitForFunction('window.__ready === true');
  const shot = async t => { await page.evaluate(t => window.renderAt(t), t); return page.screenshot({ type: 'png' }); };
  fs.mkdirSync(OUT, { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, name + '.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < FRAMES; i++) {
    if (!ff.stdin.write(await shot(i / FPS))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  fs.writeFileSync(path.join(OUT, name + '_cover.png'), await shot(COVER_T));
  await browser.close();
}

(async () => {
  const ids = process.argv.slice(2);
  if (process.env.RENDER_CHILD) { for (const id of ids) { const t0 = Date.now(); await renderOne(all.find(n => n.startsWith(id))); console.log(id, 'done', ((Date.now() - t0) / 1000).toFixed(0) + 's'); } return; }
  const t0 = Date.now();
  const todo = ids.length ? all.filter(n => ids.some(i => n.startsWith(i))) : all;
  const queue = todo.map(n => n.slice(0, 2)); let running = 0;
  await new Promise(resolve => {
    const next = () => {
      if (!queue.length && !running) return resolve();
      while (running < WORKERS && queue.length) {
        const id = queue.shift(); running++;
        const c = spawn(process.execPath, [__filename, id], { stdio: 'inherit', env: { ...process.env, RENDER_CHILD: '1' } });
        c.on('close', () => { running--; next(); });
      }
    };
    next();
  });
  console.log('TOTAL', ((Date.now() - t0) / 1000).toFixed(0) + 's');
})();
