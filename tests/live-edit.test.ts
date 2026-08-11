// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { makeRef } from '../engine/dom/ref';
import {
  applyLiveEdit,
  clearLiveEdits,
  getLiveEdits,
  resetLiveEdits,
  undoLiveEdit,
} from '../engine/live-edit/session';

beforeEach(() => {
  document.body.innerHTML = '';
  // The session is module state — reset between tests (same as pagehide).
  resetLiveEdits();
});

function buttonRef(): ReturnType<typeof makeRef> {
  document.body.innerHTML =
    '<button id="target" style="background-color: rgb(99, 91, 255)">Go</button>';
  const el = document.getElementById('target') as HTMLButtonElement;
  return makeRef(el);
}

describe('live edit session (7.21)', () => {
  it('records the original computed value and applies the new one', () => {
    const ref = buttonRef();
    const result = applyLiveEdit(ref, 'background-color', 'red');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.edits).toHaveLength(1);
    expect(result.edits[0]?.property).toBe('background-color');
    expect(result.edits[0]?.value).toBe('red');
    expect(result.edits[0]?.originalValue).toBe('rgb(99, 91, 255)');
    expect(document.getElementById('target')?.style.backgroundColor).toBe('red');
  });

  it('undo restores the original computed value exactly', () => {
    const ref = buttonRef();
    const applied = applyLiveEdit(ref, 'background-color', 'red');
    if (!applied.ok) return;
    const undone = undoLiveEdit(applied.edits[0]!.id);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.edits).toHaveLength(0);
    expect(document.getElementById('target')?.style.backgroundColor).toBe('rgb(99, 91, 255)');
  });

  it('clear reverts every edit and reports the count', () => {
    const ref = buttonRef();
    applyLiveEdit(ref, 'background-color', 'red');
    applyLiveEdit(ref, 'border-radius', '4px');
    expect(getLiveEdits().edits).toHaveLength(2);
    const cleared = clearLiveEdits();
    expect(cleared.count).toBe(2);
    expect(getLiveEdits().edits).toHaveLength(0);
    expect(document.getElementById('target')?.style.backgroundColor).toBe('rgb(99, 91, 255)');
  });

  it('is purely in-memory — a reload (fresh document) loses everything', () => {
    const ref = buttonRef();
    applyLiveEdit(ref, 'color', 'green');
    // Simulate a page reload: the document resets and the session drops.
    document.body.innerHTML = '<button id="target">Go</button>';
    resetLiveEdits();
    expect(document.getElementById('target')?.style.color).toBe('');
    expect(getLiveEdits().edits).toHaveLength(0);
  });

  it('rejects edits when the element is gone', () => {
    const ref = makeRef(document.createElement('button'));
    const result = applyLiveEdit(ref, 'color', 'red');
    expect(result.ok).toBe(false);
  });

  it('rejects an empty property', () => {
    const ref = buttonRef();
    const result = applyLiveEdit(ref, '   ', 'red');
    expect(result.ok).toBe(false);
  });

  it('undo of a missing id is an honest error', () => {
    const result = undoLiveEdit('edit-does-not-exist');
    expect(result.ok).toBe(false);
  });
});
