import { describe, expect, it } from 'vitest';
import { matchInstances } from '../engine/tokens/find';
import { sample } from './helpers/sample';

describe('matchInstances (Section 7.8)', () => {
  it('finds color instances across text/bg/border, deduping per element', () => {
    const samples = [
      sample({ color: '#635bff' }),
      sample({ backgroundColor: '#635bff', borderColor: '#635bff' }), // one element, deduped
      sample({ color: '#111111' }),
    ];
    const { count, refs } = matchInstances(samples, 'color', '#635bff');
    expect(count).toBe(2);
    expect(refs).toHaveLength(2);
  });

  it('matches font by first concrete family', () => {
    const samples = [
      sample({ fontFamily: 'Inter, sans-serif' }),
      sample({ fontFamily: 'Roboto, sans-serif' }),
    ];
    const { count } = matchInstances(samples, 'font', 'Inter');
    expect(count).toBe(1);
  });

  it('matches spacing and radius by px value', () => {
    const samples = [
      sample({ padding: '16px' }),
      sample({ margin: '8px' }),
      sample({ borderRadius: '16px' }),
    ];
    expect(matchInstances(samples, 'spacing', '16px').count).toBe(1);
    expect(matchInstances(samples, 'radius', '16px').count).toBe(1);
  });

  it('matches shadows after normalization', () => {
    const samples = [sample({ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' })];
    const { count } = matchInstances(samples, 'shadow', '0px 1px 3px rgba(0, 0, 0, 0.1)');
    expect(count).toBe(1);
  });

  it('matches gradients by normalized string', () => {
    const samples = [sample({ backgroundImage: 'linear-gradient( 90deg , #fff , #000 )' })];
    const { count } = matchInstances(samples, 'gradient', 'linear-gradient(90deg, #fff, #000)');
    expect(count).toBe(1);
  });
});
