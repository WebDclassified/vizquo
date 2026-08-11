// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { measureElement } from '../engine/measure/measure';
import type { Rect } from '../shared/types';

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

function stubRect(el: Element, r: RectLike): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => r,
    configurable: true,
  });
}

function rect(x: number, y: number, width: number, height: number): RectLike {
  return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('measureElement', () => {
  it('measures gaps to the parent on all four edges', () => {
    document.body.innerHTML = '<div id="parent"><button id="child">x</button></div>';
    const parent = document.getElementById('parent')!;
    const child = document.getElementById('child')!;
    stubRect(parent, rect(0, 0, 300, 200));
    stubRect(child, rect(20, 30, 40, 20));

    const measurements = measureElement(child, child.getBoundingClientRect() as unknown as Rect);
    expect(measurements.find((m) => m.id === 'parent-top')?.value).toBe(30);
    expect(measurements.find((m) => m.id === 'parent-left')?.value).toBe(20);
    expect(measurements.find((m) => m.id === 'parent-right')?.value).toBe(240);
    expect(measurements.find((m) => m.id === 'parent-bottom')?.value).toBe(150);
  });

  it('measures distances to the nearest sibling', () => {
    document.body.innerHTML = '<div><span class="a">A</span><span class="b">B</span></div>';
    const a = document.querySelector('.a')!;
    const b = document.querySelector('.b')!;
    stubRect(a, rect(0, 0, 50, 20));
    stubRect(b, rect(74, 0, 40, 20));

    const bRect = b.getBoundingClientRect() as unknown as Rect;
    const measurements = measureElement(b, bRect);
    const leftGap = measurements.find((m) => m.id === 'sib-left');
    expect(leftGap).toBeDefined();
    expect(leftGap?.kind).toBe('sibling');
    expect(leftGap?.edge).toBe('left');
    expect(leftGap?.value).toBe(24);
  });

  it('detects alignment with the parent edge', () => {
    document.body.innerHTML = '<div><div>aligned</div></div>';
    const parent = document.body.firstElementChild as Element;
    const child = parent.firstElementChild as Element;
    stubRect(parent, rect(0, 0, 200, 100));
    stubRect(child, rect(0, 10, 100, 30));

    const measurements = measureElement(child, child.getBoundingClientRect() as unknown as Rect);
    expect(measurements.some((m) => m.id === 'align-left' && m.kind === 'alignment')).toBe(true);
  });

  it('always reports viewport distances', () => {
    document.body.innerHTML = '<div>v</div>';
    const el = document.body.firstElementChild as Element;
    stubRect(el, rect(50, 60, 80, 40));
    const measurements = measureElement(el, el.getBoundingClientRect() as unknown as Rect);
    expect(measurements.find((m) => m.id === 'vp-top')?.value).toBe(60);
    expect(measurements.find((m) => m.id === 'vp-left')?.value).toBe(50);
  });
});
