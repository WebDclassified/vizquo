/**
 * Time Machine (Section 7.15) — live width emulation in the content script.
 *
 * Resizes the page inside a same-origin iframe so `@media (min|max-width)`
 * rules actually re-evaluate at the chosen width, then reports the real
 * layout width and horizontal overflow. One iframe is created lazily and
 * reused (resize re-evaluates media queries — no reload per probe).
 *
 * Honest limits: a page that forbids framing (X-Frame-Options / CSP
 * frame-ancestors) yields `ok: false` — the panel falls back to the
 * deterministic breakpoint mapping, never a fabricated emulation.
 */
import type { Breakpoint, TimeMachineResult } from '../../shared/types';
import { activeAtWidth } from './breakpoints';

interface EmulationState {
  iframe: HTMLIFrameElement;
  ready: Promise<boolean>;
}

let state: EmulationState | null = null;

/**
 * Tear down the emulation iframe and forget it. Must be called on real
 * unload (`pagehide`) — otherwise a live copy of the page (its scripts,
 * timers, animations, network requests) would outlive the session.
 */
export function disposeTimeMachine(): void {
  if (state) {
    state.iframe.remove();
    state = null;
  }
}

function createIframe(): EmulationState {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.cssText =
    'position:absolute;left:-10000px;top:0;width:1px;height:600px;border:0;visibility:hidden;pointer-events:none;';
  document.documentElement.appendChild(iframe);

  const ready = new Promise<boolean>((resolve) => {
    // Some pages never fire load on error — time out rather than hang. The
    // timer is cleared once load/error settles so it can't hold the iframe
    // and resolver alive for 8s on every tab.
    const timeout = window.setTimeout(() => resolve(false), 8000);
    const settle = (ok: boolean): void => {
      window.clearTimeout(timeout);
      resolve(ok);
    };
    iframe.addEventListener('load', () => settle(true), { once: true });
    iframe.addEventListener('error', () => settle(false), { once: true });
  });

  try {
    iframe.src = window.location.href;
  } catch {
    // Unreachable — src is same-origin by construction.
  }
  state = { iframe, ready };
  return state;
}

/** Probe one width. Returns null when emulation is unavailable. */
export async function runTimeMachine(
  width: number,
  breakpoints: Breakpoint[],
): Promise<TimeMachineResult> {
  if (width < 1) {
    return { ok: false, error: 'Choose a viewport width to probe.' };
  }

  // Deterministic mapping is always available — the fallback core.
  const mapped = activeAtWidth(breakpoints, width);

  // Lazily create + reuse the emulation iframe.
  let active = state;
  if (!active) {
    active = createIframe();
  }
  const loaded = await active.ready;

  // A page can forbid framing — fall back to the deterministic mapping.
  let content: Document | null = null;
  try {
    content = active.iframe.contentDocument;
  } catch {
    content = null;
  }
  if (!loaded || !content?.documentElement) {
    return {
      ok: true,
      width,
      breakpoints: mapped,
      layoutWidth: 0,
      horizontalOverflow: false,
      emulated: false,
    };
  }

  // Resize → media queries re-evaluate; measure after a frame.
  // The iframe is reused across probes; it is torn down by
  // `disposeTimeMachine()` on pagehide (never left to run the page forever).
  active.iframe.style.width = `${width}px`;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const docEl = content.documentElement;
  const layoutWidth = docEl.scrollWidth;
  const horizontalOverflow = layoutWidth > width;

  // Cross-check the deterministic mapping against the real engine.
  const verified = mapped.map((bp) => {
    let matches = bp.active;
    try {
      matches = content?.defaultView?.matchMedia(bp.raw).matches ?? bp.active;
    } catch {
      // Unparsable condition — keep the deterministic result.
    }
    return { ...bp, active: matches };
  });

  return {
    ok: true,
    width,
    breakpoints: verified,
    layoutWidth,
    horizontalOverflow,
    emulated: true,
  };
}
