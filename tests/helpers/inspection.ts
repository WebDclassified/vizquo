import type { Inspection, InspectionTokens } from '../../shared/types';

/** Overrides for makeInspection — tokens merge per kind instead of replacing. */
export interface InspectionOverrides extends Partial<Omit<Inspection, 'tokens'>> {
  tokens?: Partial<InspectionTokens>;
}

/**
 * Full Inspection fixture — override any field. The single source for the
 * inspection shape across unit tests (compare, timeline, report, storage, AI).
 * Defaults mirror a minimal completed scan of https://example.com/.
 */
export function makeInspection(overrides: InspectionOverrides = {}): Inspection {
  const { tokens: tokenOverrides, ...rest } = overrides;
  return {
    id: 'ins',
    page: { url: 'https://example.com/', title: 'Example', scannedAt: 1000 },
    createdAt: 1000,
    assets: [],
    components: [],
    findings: [],
    variables: [],
    gradients: [],
    breakpoints: [],
    typeStyles: [],
    consistencyScore: 88,
    scanDurationMs: 0,
    truncated: false,
    scannedElementCount: 0,
    metrics: {
      imageCount: 0,
      svgCount: 0,
      animationCount: 0,
      transitionCount: 0,
      breakpointCount: 0,
    },
    cached: false,
    stale: false,
    technologies: [],
    containerQueries: [],
    viewportMeta: true,
    tokens: {
      colors: tokenOverrides?.colors ?? [],
      fonts: tokenOverrides?.fonts ?? [],
      spacing: tokenOverrides?.spacing ?? [],
      radius: tokenOverrides?.radius ?? [],
      shadows: tokenOverrides?.shadows ?? [],
    },
    ...rest,
  };
}
