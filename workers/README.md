# workers/

> Created by Prabhat Teotia


Comlink-wrapped analysis entrypoints. Heavy compute never blocks the
content-script or panel thread:

- color clustering (culori)
- structural / visual similarity matching
- full-page scans over ~1,000 nodes

Lands in Phase 3. Results are memoized per content hash
(stale-while-revalidate, Section 2.3 L2).

**The pipeline itself lives in `engine/analysis/pipeline.ts`** — pure and
environment-agnostic. The worker here is a thin Comlink wrapper; when a
page's CSP blocks `blob:` workers (YouTube is a known case), the orchestrator
runs the *same* pipeline synchronously on the main thread instead, so scans
complete everywhere. Change the analysis in `engine/analysis/pipeline.ts`,
never in this wrapper.
