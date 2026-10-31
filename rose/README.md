# Parametric 3D rose loop (6 s, 1080x1920, 30 fps)

Paul Nylander's rose surface rendered in Three.js (UnrealBloomPass), deterministic by time `t`.
`window.renderAt(t)` draws any frame; `render.js` steps it with headless Chromium (SwiftShader) and pipes PNGs to ffmpeg.

Timeline: 0-1s equation types out · 1-3.5s ice-blue wireframe grows centre→out · 3.5-5s iridescent fill + bloom · 5-6s dissolve to particles → single point → dark (frame 180 ≡ frame 0).

## Re-render
```bash
cd rose && npm install && node render.js
```
Outputs `out/rose.mp4` (libx264, preset veryfast, crf 18, yuv420p) and `out/rose_cover.png` (t=4.3 s).
Single stills: `node render.js still 4.3=out/still.png`.
Needs `playwright` + Chromium and `ffmpeg` on PATH. Uses the JetBrains Mono ExtraLight font if installed (falls back to monospace).
