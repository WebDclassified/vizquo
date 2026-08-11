import { describe, expect, it } from 'vitest';
import { clusterColors } from '../engine/tokens/color';
import { classifyColorRoles } from '../engine/tokens/roles';
import { sample } from './helpers/sample';

describe('classifyColorRoles (Section 7.3)', () => {
  it('classifies a heavily-used chromatic button color as primary', () => {
    const samples = [
      sample({ color: '#635bff', isButton: true, tag: 'button' }),
      sample({ color: '#635bff', isButton: true, tag: 'button' }),
      sample({ color: '#635bff', isButton: true, tag: 'button' }),
      sample({ color: '#635bff', isLink: true, tag: 'a' }),
      sample({ color: '#111111', textLength: 40 }),
      sample({ backgroundColor: '#ffffff' }),
    ];
    const tokens = classifyColorRoles(clusterColors(samples), samples);
    const primary = tokens.find((t) => t.value.role === 'primary');
    expect(primary).toBeDefined();
    expect(primary!.confidence.level).toBe('inferred');
    expect(primary!.confidence.basis).toMatch(/buttons/);
  });

  it('classifies the most-used neutral background as background', () => {
    const samples = [
      sample({ backgroundColor: '#ffffff' }),
      sample({ backgroundColor: '#ffffff' }),
      sample({ backgroundColor: '#f4f5f7' }),
    ];
    const tokens = classifyColorRoles(clusterColors(samples), samples);
    const bg = tokens.find((t) => t.value.role === 'background');
    expect(bg).toBeDefined();
    expect(bg!.value.hex).toBe('#ffffff');
  });

  it('flags semantic hint colors (error/success) from class names', () => {
    const samples = [sample({ color: '#d93025', classes: ['alert-error'], textLength: 12 })];
    const tokens = classifyColorRoles(clusterColors(samples), samples);
    const error = tokens.find((t) => t.value.role === 'error');
    expect(error).toBeDefined();
  });

  it('never fabricates a role when there is no signal', () => {
    const samples = [sample({ borderColor: '#0f766e' })];
    const tokens = classifyColorRoles(clusterColors(samples), samples);
    for (const token of tokens) {
      expect(['border', 'accent', 'unknown']).toContain(token.value.role);
    }
  });
});
