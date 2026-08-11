/**
 * Skeleton placeholders (Section 7.27) — shown while an element inspection is
 * loading, matching the eventual property-row layout instead of a spinner.
 */
export function PropertyRowsSkeleton() {
  const rows = [58, 42, 66, 50, 38, 62, 46];
  return (
    <div class="flex flex-col gap-1 p-2" role="status" aria-label="Analyzing element">
      {rows.map((width) => (
        <div class="flex items-center gap-2 px-1.5 py-1">
          <div
            class="h-3 shrink-0 animate-pulse rounded bg-[var(--vq-bg-sunken)]"
            style={{ width: `${Math.min(width, 60)}%` }}
          />
          <div class="h-3 flex-1 animate-pulse rounded bg-[var(--vq-bg-sunken)]" />
        </div>
      ))}
      <p class="sr-only">Analyzing the selected element…</p>
    </div>
  );
}

export function DomTreeSkeleton() {
  const rows = [72, 52, 64, 44, 58];
  return (
    <div class="flex flex-col gap-1 p-2" role="status" aria-label="Building DOM tree">
      {rows.map((width, index) => (
        <div
          class="h-3.5 animate-pulse rounded bg-[var(--vq-bg-sunken)]"
          style={{ width: `${width}%`, 'margin-left': `${index * 10}px` }}
        />
      ))}
      <p class="sr-only">Building the DOM tree…</p>
    </div>
  );
}
