/**
 * Structural similarity + recurring structures (Sections 7.8/7.11) — pure,
 * worker-side. Each element is reduced to a small structural signature (tag,
 * role, button/link semantics, child-tag sequence, class fingerprint, depth
 * band); similarity is LCS length over the token arrays — a cheap stand-in for
 * tree-edit distance — with explicit penalties for tag/role mismatches.
 */
import type {
  Component,
  Confidence,
  ElementRef,
  ElementSample,
  SimilarityResult,
} from '../../shared/types';

/** Up to this many child tags feed the signature (deeper trees still work). */
const SIGNATURE_CHILD_CAP = 8;
/** Minimum similarity for a "similar" candidate. */
export const MIN_SIMILARITY = 0.5;
/** Maximum candidates returned by find-similar. */
export const MAX_SIMILAR_RESULTS = 8;

export function elementSignature(sample: ElementSample): string[] {
  const tokens: string[] = [sample.tag.toLowerCase()];
  if (sample.role) tokens.push(`role:${sample.role}`);
  if (sample.isButton) tokens.push('button');
  if (sample.isLink) tokens.push('link');
  if (sample.isFormControl) tokens.push('form');
  const children = sample.childTags.slice(0, SIGNATURE_CHILD_CAP).join(',');
  tokens.push(children ? `children:${children}` : 'leaf');
  const classFingerprint = sample.classes
    .slice(0, 2)
    .map((c) => c.toLowerCase())
    .join('.');
  tokens.push(`classes:${sample.classes.length}:${classFingerprint}`);
  tokens.push(sample.depth <= 2 ? 'top' : sample.depth <= 6 ? 'mid' : 'deep');
  return tokens;
}

export function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      curr[j] =
        a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[n] ?? 0;
}

export function structuralSimilarity(
  a: ElementSample,
  b: ElementSample,
): { similarity: number; basis: string } {
  const sa = elementSignature(a);
  const sb = elementSignature(b);
  const lcs = lcsLength(sa, sb);
  let similarity = lcs / Math.max(sa.length, sb.length);
  if (a.tag !== b.tag) similarity *= 0.6;
  if ((a.role ?? '') !== (b.role ?? '')) similarity *= 0.9;

  const basisParts: string[] = [];
  if (a.tag === b.tag) basisParts.push('same tag');
  if (a.isButton === b.isButton && a.isButton) basisParts.push('button');
  if ((a.role ?? '') === (b.role ?? '') && a.role) basisParts.push(`role ${a.role}`);
  const sameChildren =
    a.childTags.slice(0, SIGNATURE_CHILD_CAP).join(',') ===
    b.childTags.slice(0, SIGNATURE_CHILD_CAP).join(',');
  if (sameChildren && a.childTags.length > 0) basisParts.push('same child structure');
  if (a.classes.length > 0 && a.classes.some((c) => b.classes.includes(c))) {
    basisParts.push('shared class');
  }
  const basis = basisParts.length > 0 ? basisParts.join(', ') : 'structural similarity';
  return { similarity: Math.min(1, similarity), basis };
}

/** Top-N structurally similar elements for a target (worker API). */
export function findSimilarSamples(
  target: ElementSample,
  samples: ElementSample[],
): SimilarityResult[] {
  const results: { ref: ElementRef; similarity: number; basis: string }[] = [];
  for (const sample of samples) {
    if (
      sample.ref.domPath.join('.') === target.ref.domPath.join('.') &&
      sample.ref.selector === target.ref.selector
    )
      continue;
    const { similarity, basis } = structuralSimilarity(target, sample);
    if (similarity >= MIN_SIMILARITY) {
      results.push({ ref: sample.ref, similarity, basis });
    }
  }
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, MAX_SIMILAR_RESULTS);
}

/** Recurring structures (Section 7.3 components, feeds 7.11) — ≥3 instances. */
export function detectRecurringComponents(samples: ElementSample[]): Component[] {
  const MIN_INSTANCES = 3;
  const byPattern = new Map<string, ElementSample[]>();
  for (const sample of samples) {
    const children = sample.childTags.slice(0, SIGNATURE_CHILD_CAP).join(',');
    const key = `${sample.tag.toLowerCase()}|${children}|${sample.classes.length}`;
    const list = byPattern.get(key);
    if (list) list.push(sample);
    else byPattern.set(key, [sample]);
  }
  const components: Component[] = [];
  for (const [key, instances] of byPattern) {
    if (instances.length < MIN_INSTANCES) continue;
    const type = key.split('|')[0] ?? instances[0]?.tag ?? 'element';
    const variants = new Map<string, ElementRef[]>();
    for (const sample of instances) {
      const variantKey = sample.classes[0] ?? 'default';
      const list = variants.get(variantKey);
      if (list) list.push(sample.ref);
      else variants.set(variantKey, [sample.ref]);
    }
    const confidence: Confidence = {
      level: 'inferred',
      score: Math.min(0.95, instances.length / 12),
      basis: `${instances.length} instances with identical structure`,
    };
    components.push({
      id: `component-${components.length}`,
      type,
      instances: instances.slice(0, 30).map((s) => s.ref),
      confidence,
      variants: Object.fromEntries(variants),
    });
  }
  return components.sort((a, b) => b.instances.length - a.instances.length);
}
