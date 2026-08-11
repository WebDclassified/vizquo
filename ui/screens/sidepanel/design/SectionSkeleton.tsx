/**
 * Skeleton matching a Design DNA section's eventual layout (Section 7.27).
 * Loading feels like instrumentation (brand system §33): a monospace
 * uppercase label plus a scanning line, then the structural pulse bars.
 */
export function SectionSkeleton() {
  return (
    <div class="flex flex-col gap-1.5 p-3" role="status" aria-label="Analyzing section">
      <div class="flex items-center justify-between">
        <p class="vq-meta">Analyzing…</p>
        <p class="vq-meta" style={{ opacity: 0.5 }}>
          Scan
        </p>
      </div>
      <div class="vq-scanline mb-1" aria-hidden="true" />
      <div class="mb-1 h-3 w-28 animate-pulse rounded bg-[var(--vq-bg-sunken)]" />
      {[88, 66, 78, 54, 72].map((width) => (
        <div class="flex items-center gap-2 px-1">
          <div class="h-4 w-4 shrink-0 animate-pulse rounded bg-[var(--vq-bg-sunken)]" />
          <div
            class="h-3 animate-pulse rounded bg-[var(--vq-bg-sunken)]"
            style={{ width: `${width}%` }}
          />
        </div>
      ))}
      <p class="sr-only">Analyzing this section…</p>
    </div>
  );
}
