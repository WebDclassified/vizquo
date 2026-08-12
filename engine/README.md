# engine/

> Created by Prabhat Teotia


The extraction engine (master spec Section 2). Lands in phases 2–3.

- `scan/` — DOM walk, incremental analysis, MutationObserver management (Phase 2–3)
- `css/` — css-tree based matched-rule / cascade / specificity / source-map (Phase 2)
- `tokens/` — color (culori) / typography / spacing / radius / shadow / gradient extraction (Phase 3)
- `assets/` — image/svg/font/media extraction + classification (Phase 4)
- `components/` — structural + visual similarity detection (Phase 3/8)
- `accessibility/` — contrast, ARIA, semantics, focus order (Phase 5)
- `responsive/` — breakpoint + viewport analysis (Phase 5)
- `technology/` — framework/library/platform detection (Phase 5)

Every module reads/writes the entities in `shared/types.ts` and talks storage
only through `VizquoRepository`.
