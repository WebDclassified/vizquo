/**
 * Vizquo brand logo — the "V-Lens" mark + lowercase "vizquo" wordmark.
 *
 * V-LENS CONCEPT — "See beyond the surface."
 * A bold geometric V (the instrument) whose mouth holds a precision lens ring
 * (the viewport). The V is the dominant silhouette; the ring is the detail
 * discovered on a second look — exactly how an inspection tool works.
 *
 * The mark and wordmark use `currentColor`, so they inherit the parent's text
 * color and adapt to light/dark themes. Monochrome-first per the brand system.
 * Rendered as an accessible image (role="img" with a label).
 */
export function Logo(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 72 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Vizquo"
      class={props.class}
    >
      {/* V-Lens mark (24px box, scaled from the canonical 128 viewBox) */}
      <g stroke="currentColor" stroke-linecap="round">
        <line x1="12" y1="22" x2="2.4" y2="3.4" stroke-width="4.9" />
        <line x1="21.6" y1="3.4" x2="12" y2="22" stroke-width="4.9" />
        <circle cx="12" cy="11.2" r="4.1" stroke-width="1.1" />
      </g>
      {/* wordmark */}
      <text
        x="26"
        y="17.4"
        font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-weight="700"
        font-size="15"
        letter-spacing="-0.4"
        fill="currentColor"
      >
        vizquo
      </text>
    </svg>
  );
}
