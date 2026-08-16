import { browser } from 'wxt/browser';

/**
 * Vizquo brand logo — the horizontal lockup (V-Lens mark + "vizquo"
 * wordmark), bundled into the extension as /icon/horizontal-logo.png.
 *
 * The artwork is light-on-black; `mix-blend-mode: screen` drops the black
 * field so the logo floats on the panel's dark glass surface.
 */
const LOGO_URL = (browser.runtime.getURL as (path: string) => string)('/icon/horizontal-logo.png');

export function Logo(props: { class?: string }) {
  return (
    <img src={LOGO_URL} alt="Vizquo" class={props.class} style={{ 'mix-blend-mode': 'screen' }} />
  );
}
