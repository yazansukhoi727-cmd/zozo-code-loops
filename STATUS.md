# STATUS

Date: 2026-11-01

## Commits
- main, design commit: `858db44`
- main, render-all.js: `bd1927e`
- renders branch: `a66a52d` (01-09), `b6ac4ba` + `61d6d2e` (10-13, 15-20), `bff446a` (14)

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
| 10 | password-lock | yes | complete |
| 11 | neon-clock | yes | complete |
| 12 | aurora-silk | yes | complete |
| 13 | aizawa-attractor | yes | complete |
| 14 | jellyfish | yes | complete |
| 15 | lofi-rain-room | yes | complete |
| 16 | chrome-tubes | yes | complete |
| 17 | glossy-spheres | yes | complete |
| 18 | gift-cards | yes | complete |
| 19 | coupon-tickets | yes | complete |
| 20 | green-crystal | yes | complete |

## Known open issues
- "Animation" subtitle style is inconsistent (03-15 uppercase, others title case, 16-20 colored). Waiting for owner decision: keep or remove.
- 16-chrome-tubes still reads as wireframe rather than glass (owner assessment; glass shading was added in 858db44, needs owner re-check).
- 02-math-galaxy not visually verified yet.

## Resume rendering
All 20 designs are rendered. To re-render a subset: `node render-all.js 05 12 17` (no ids = all 20, 4 workers; `WORKERS=n` overrides). Needs `npm i three esbuild` once for 01/02. Heavy designs (12, 14) can hit the 30 s screenshot timeout under 4 parallel workers; re-run them alone.
