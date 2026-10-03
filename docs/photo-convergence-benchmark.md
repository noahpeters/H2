# Adaptive photo comparison, October 3, 2026

The real WebGL fixture uses the production StudyScene, photo snapshot, deterministic path tracer, contact refinement, guided denoiser and AgX finishing. A 144×120-inch room contains one 48-inch oak cabinet and a 48×44-inch window. The captured camera is outside the cutaway room at (4, 3.5, 5), aiming at (0, 0.6, 0). The dim-gloss variant reduces daylight intensity from 100 to 20 and uses roughness 0.12. Both captures in each pair use identical prepared geometry, camera, settings, output dimensions and Standard 1.5× supersampling; the reference disables adaptive stopping and runs 256 passes.

Measured in the Codex in-app browser on this Mac, sequentially. Timing covers accumulation, shader warmup and finishing; scene/renderer preparation before the accumulation timer is excluded. Full references run second and can benefit from warmup. Whole-image RMS and 95th-percentile differences compare finished PNG RGB in normalized sRGB, not raw ray variance.

| Scene     | Output | Adaptive / full passes | Adaptive / full time | Time saved | PNG RMS difference | PNG p95 difference |
| --------- | ------ | ---------------------- | -------------------- | ---------- | ------------------ | ------------------ |
| daylight  | 320px  | 96 / 256               | 13.35s / 33.85s      | 60.6%      | 2.25%              | 3.69%              |
| dim-gloss | 320px  | 64 / 256               | 8.89s / 32.83s       | 72.9%      | 1.37%              | 2.76%              |
| daylight  | 1000px | 112 / 256              | 25.05s / 56.91s      | 56.0%      | 1.91%              | 3.16%              |

At 1000px, Standard required 112 passes: the 80/96/112 checkpoints passed all three clarity guards. At 320px, daylight required 96 and dim-gloss required 64. Thus a universal fixed 20%-of-budget target would be too aggressive for these scenes. Adaptive stopping measures diminishing returns and retains the old caps when clarity remains unstable. Super high quality intentionally bypasses stopping and traces 512 passes at 2× resolution, matching the previous Fine option.

These are representative fixtures, not a universal optimal pass count or proof of indistinguishable images. Differences remain in indirect illumination, highlights and reflections; the full budget can improve them. Glass, tiny hardware, rare bright paths, extreme lighting and larger rooms need broader coverage. The sparse grid and bounded regional checks can miss very small unstable features. Nonlinear filtering makes the noise statistic a perceptual heuristic, not a statistical confidence bound. All options retain the same materials, grain, geometry, lighting model and finishing.

Reproduce with a Vite server that supports the repository's `~` alias and automatic JSX, then open:

- `/scripts/fixtures/photo-convergence.html` for both 320px pairs.
- `/scripts/fixtures/photo-convergence.html?dimension=1000&daylight-only` for the 1000px pair.

The page displays pass counts, timings, checkpoint measurements, PNG differences and image pairs. Preview buttons use the real PhotoDialog to inspect the lower-left control; their refine callback closes the fixture preview only. Actual rerender, error and cancellation behavior is covered by PhotoFailure.test.tsx and photoRender.test.ts. No console errors occurred in these GPU runs.
