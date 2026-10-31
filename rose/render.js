// Usage: node render.js            -> out/rose.mp4 + out/rose_cover.png
//        node render.js still 4.3 out/still.png   -> single frame
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path'), fs = require('fs');
const dir = __dirname, FPS = 30, FRAMES = 180;
execSync('npx esbuild main.js --bundle --minify --outfile=bundle.js', { cwd: dir, stdio: 'ignore' });
fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGEERR', e.message));
  await page.goto('file://' + path.join(dir, 'index.html'));
  await page.waitForFunction('window.__ready === true');
  const shot = async t => { await page.evaluate(t => window.renderAt(t), t); return page.screenshot({ type: 'png' }); };
  if (process.argv[2] === 'still') {
    for (const a of process.argv.slice(3)) { const [t, f] = a.split('='); fs.writeFileSync(f, await shot(parseFloat(t))); }
    return browser.close();
  }
  const out = path.join(dir, 'out/rose.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < FRAMES; i++) {
    const buf = await shot(i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 30 === 0) console.log('frame', i);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  fs.writeFileSync(path.join(dir, 'out/rose_cover.png'), await shot(4.3));
  await browser.close();
})();
