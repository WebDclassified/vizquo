# workers/

Comlink-wrapped Web Worker entrypoints (Section 2). Heavy compute never blocks
the content-script or panel thread:

- color clustering (culori)
- structural / visual similarity matching
- full-page scans over ~1,000 nodes

Lands in Phase 3. Worker results are memoized per subtree hash
(stale-while-revalidate, Section 2.3 L2).
