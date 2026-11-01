# STATUS

Date: 2026-11-01

## Commits
- main, design commit: `858db44`
- main, render-all.js: `bd1927e`
- renders branch (renders 01-09): `a66a52d`

## Designs
| # | name | design fixed | rendered |
|---|------|--------------|----------|
| 01 | math-rose | yes | complete |
| 02 | math-galaxy | yes | complete |
| 03 | coupon-scratch | yes | complete |
| 04 | add-to-cart | yes | complete |
| 05 | card-payment | yes | complete |
| 06 | submit-button | yes | complete |
| 07 | otp-particles | yes | complete |
| 08 | order-island | yes | complete |
| 09 | restaurant-menu | yes | complete |
| 10 | password-lock | yes | partial (274/300 frames, no cover, not committed) |
| 11 | neon-clock | yes | partial (245/300 frames, no cover, not committed) |
| 12 | aurora-silk | yes | partial (66/300 frames, no cover, not committed) |
| 13 | aizawa-attractor | yes | partial (33/300 frames, no cover, not committed) |
| 14 | jellyfish | yes | not started |
| 15 | lofi-rain-room | yes | not started |
| 16 | chrome-tubes | yes | not started |
| 17 | glossy-spheres | yes | not started |
| 18 | gift-cards | yes | not started |
| 19 | coupon-tickets | yes | not started |
| 20 | green-crystal | yes | not started |

## Known open issues
- "Animation" subtitle style is inconsistent (03-15 uppercase, others title case, 16-20 colored). Waiting for owner decision: keep or remove.
- 16-chrome-tubes still reads as wireframe rather than glass (owner assessment; glass shading was added in 858db44, needs owner re-check).
- 02-math-galaxy not visually verified yet.

## Resume rendering
Partial files 10-13 are untracked in renders/ and get overwritten on re-render. Remaining: 10 11 12 13 14 15 16 17 18 19 20.
`render-all.js` already takes design ids as a filter (no ids = all 20, 4 workers; `WORKERS=n` overrides). Needs `npm i three esbuild` once for 01/02.

```bash
node render-all.js 10 11 12 13 14 15 16 17 18 19 20
```

Then commit the new mp4 + cover pairs to the `renders` branch (not main). About 5 min per design alone.
