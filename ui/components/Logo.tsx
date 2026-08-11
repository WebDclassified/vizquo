/**
 * Vizquo brand logo — magnifier mark + "Vizquo" wordmark (brand asset).
 *
 * The mark and wordmark use `currentColor`, so they inherit the parent's text
 * color and adapt to light/dark themes; the inner dot keeps the brand teal
 * (#3FE0C8) per the brand spec. Rendered as an accessible image (role="img"
 * with a label) so screen readers announce it once.
 */
export function Logo(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 132 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Vizquo"
      class={props.class}
    >
      {/* mark */}
      <circle cx="10.5" cy="10.5" r="7" stroke="currentColor" stroke-width="1.8" />
      <line
        x1="15.5"
        y1="15.5"
        x2="21"
        y2="21"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <circle cx="10.5" cy="10.5" r="2.4" fill="#3FE0C8" />
      {/* wordmark */}
      <text
        x="30"
        y="17"
        font-family="Manrope, sans-serif"
        font-weight="800"
        font-size="17"
        letter-spacing="-0.2"
        fill="currentColor"
      >
        Vizquo
      </text>
    </svg>
  );
}
