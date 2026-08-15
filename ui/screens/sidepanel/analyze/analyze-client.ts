/**
 * Analyze client — the side panel's bridge for Phase 5 actions (Sections
 * 7.13–7.15). Time Machine probes run in the content script (same-origin
 * iframe emulation); finding highlighting reuses the shared HIGHLIGHT_REFS
 * surface. Both guard on a scannable tab like every other action.
 */
import { sendTabMessage } from '../../../../shared/messages';
import type { ElementRef, TimeMachineResult } from '../../../../shared/types';
import { notify } from '../../../stores/toast';
import { ui } from '../../../stores/ui-store';

/** Whether the connection points at a real web page. */
function isWebTab(): boolean {
  try {
    return /^https?:$/.test(new URL(ui.connection.tabUrl ?? '').protocol);
  } catch {
    return false;
  }
}

/** Probe one viewport width via the content script's Time Machine. */
export async function runTimeMachine(width: number): Promise<TimeMachineResult | null> {
  if (!isWebTab() || ui.connection.tabId == null) {
    return { ok: false, error: 'Open a website to probe responsive behavior.' };
  }
  try {
    return await sendTabMessage(ui.connection.tabId, 'RUN_TIME_MACHINE', { width });
  } catch {
    return { ok: false, error: 'The page did not answer. Grant access and try again.' };
  }
}

/** Highlight one finding's element on the page. */
export async function highlightFinding(ref: ElementRef | undefined): Promise<void> {
  if (!ref || !isWebTab() || ui.connection.tabId == null) return;
  try {
    await sendTabMessage(ui.connection.tabId, 'HIGHLIGHT_REFS', {
      refs: [ref],
      label: 'Finding',
    });
    notify({ title: 'Finding highlighted on the page', description: 'Press Esc to clear.' });
  } catch {
    // Content script not connected — silent.
  }
}
