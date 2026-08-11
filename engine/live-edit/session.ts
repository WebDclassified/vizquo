/**
 * Live editing (Section 7.21) — in-memory CSS edits, never persisted.
 *
 * An edit records the element's computed value *before* the change so undo is
 * exact. Edits exist only in this module's memory: a page reload reverts them
 * by construction (law #4), and "Reset all" reverts them on demand. No edit
 * ever touches a stylesheet or the repository.
 *
 * This module runs in the content script (it needs the live DOM). The pure
 * bookkeeping (finding the original value, the edit list) is unit-tested with
 * happy-dom.
 */

import type { ElementRef, LiveEdit } from '../../shared/types';
import { resolveRef } from '../dom/ref';

let edits: LiveEdit[] = [];
let nextId = 1;

/** Apply a CSS edit to one element; returns the (possibly empty) edit list. */
export function applyLiveEdit(
  ref: ElementRef,
  property: string,
  value: string,
): { ok: true; edits: LiveEdit[] } | { ok: false; error: string } {
  const prop = property.trim();
  if (!prop) return { ok: false, error: 'Choose a property to edit.' };
  const el = resolveRef(ref);
  if (!el || !(el instanceof HTMLElement)) {
    return { ok: false, error: 'The element is no longer on the page — reload and re-select.' };
  }
  const originalValue = getComputedStyle(el).getPropertyValue(prop) || '';
  const edit: LiveEdit = {
    id: `edit-${nextId}`,
    ref,
    property: prop,
    value,
    originalValue,
    at: Date.now(),
  };
  nextId += 1;
  // Apply via the inline style — the browser restores everything on reload.
  el.style.setProperty(prop, value);
  edits = [...edits, edit];
  return { ok: true, edits };
}

/** Revert one edit to the element's original computed value. */
export function undoLiveEdit(
  id: string,
): { ok: true; edits: LiveEdit[] } | { ok: false; error: string } {
  const edit = edits.find((e) => e.id === id);
  if (!edit) return { ok: false, error: 'That edit is no longer in the session.' };
  const el = resolveRef(edit.ref);
  if (el instanceof HTMLElement) {
    if (edit.originalValue) el.style.setProperty(edit.property, edit.originalValue);
    else el.style.removeProperty(edit.property);
  }
  edits = edits.filter((e) => e.id !== id);
  return { ok: true, edits };
}

/** Revert every live edit. Returns how many were reverted. */
export function clearLiveEdits(): { count: number } {
  for (const edit of edits) {
    const el = resolveRef(edit.ref);
    if (el instanceof HTMLElement) {
      if (edit.originalValue) el.style.setProperty(edit.property, edit.originalValue);
      else el.style.removeProperty(edit.property);
    }
  }
  const count = edits.length;
  edits = [];
  return { count };
}

/** The current edit list (for the panel's before/after + undo UI). */
export function getLiveEdits(): { edits: LiveEdit[] } {
  return { edits: [...edits] };
}

/**
 * Drop the whole session without touching the DOM. Called on `pagehide`
 * (real unload + SPA navigations) so a stale edit list can never outlive the
 * page it edited — law #4, enforced at the lifecycle boundary.
 */
export function resetLiveEdits(): void {
  edits = [];
}
