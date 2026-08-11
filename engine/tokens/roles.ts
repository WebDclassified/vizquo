/**
 * Design-DNA color role classification (Section 7.3) — pure, worker-side.
 *
 * Roles are pattern-based (hence `inferred` with a human-readable basis, law
 * #2): usage kind (text / background / border), element semantics (button,
 * link, form control), and class/role hints drive the assignment. Roles are
 * never presented as facts.
 */
import type { ColorRole, ColorToken, Confidence, ElementSample } from '../../shared/types';
import {
  type ColorUsage,
  collectColorUsages,
  type NormalizedColor,
  normalizeColorValue,
  oklchDistanceBetween,
} from './color';

interface RoleStats {
  text: number;
  background: number;
  border: number;
  buttons: number;
  links: number;
  forms: number;
  hint: 'success' | 'warning' | 'error' | null;
  medianTextLength: number;
}

const HINT_PATTERNS: { role: 'success' | 'warning' | 'error'; re: RegExp }[] = [
  { role: 'error', re: /(^|[-_])(error|danger|fail(?:ed)?|invalid|denied|incorrect)([-_]|$)/i },
  { role: 'warning', re: /(^|[-_])(warn(?:ing)?|caution|attention)([-_]|$)/i },
  { role: 'success', re: /(^|[-_])(success|ok|passed|valid|complete)([-_]|$)/i },
];

function hintFor(usage: ColorUsage): 'success' | 'warning' | 'error' | null {
  const haystack = [usage.id ?? '', usage.ariaRole ?? '', ...usage.classes].join(' ');
  for (const { role, re } of HINT_PATTERNS) {
    if (re.test(haystack)) return role;
  }
  return null;
}

function buildStats(usages: ColorUsage[]): RoleStats {
  let text = 0;
  let background = 0;
  let border = 0;
  let buttons = 0;
  let links = 0;
  let forms = 0;
  let hint: RoleStats['hint'] = null;
  const lengths: number[] = [];
  for (const u of usages) {
    if (u.kind === 'text') {
      text += 1;
      lengths.push(u.textLength);
    } else if (u.kind === 'background') background += 1;
    else border += 1;
    if (u.isButton) buttons += 1;
    if (u.isLink) links += 1;
    if (u.isFormControl) forms += 1;
    const h = hintFor(u);
    if (h && hint === null) hint = h;
  }
  lengths.sort((a, b) => a - b);
  const median = lengths.length > 0 ? (lengths[Math.floor(lengths.length / 2)] ?? 0) : 0;
  return { text, background, border, buttons, links, forms, hint, medianTextLength: median };
}

function inferred(_role: ColorRole, basis: string, score: number): Confidence {
  return {
    level: 'inferred',
    score: Math.min(0.99, score),
    basis,
  };
}

function detectedBasis(): Confidence {
  return { level: 'detected' };
}

function usageBasis(usages: ColorUsage[], role: ColorRole, primaryLabel?: string): string {
  const parts: string[] = [];
  const b = usages.filter((u) => u.isButton).length;
  const l = usages.filter((u) => u.isLink).length;
  const bg = usages.filter((u) => u.kind === 'background').length;
  if (b > 0) parts.push(`${b} buttons`);
  if (l > 0) parts.push(`${l} links`);
  if (bg > 0) parts.push(`${bg} backgrounds`);
  const suffix = parts.length > 0 ? ` — from ${usages.length} usages: ${parts.join(', ')}` : '';
  const hint = usages.map((u) => hintFor(u)).find((h) => h != null);
  const hintNote = hint ? ` (role hint found in ${hint} class/role names)` : '';
  return `${primaryLabel ?? role}${suffix}${hintNote}`;
}

/**
 * Assign Design-DNA roles to clustered color tokens. Pure: same inputs, same
 * roles. Tokens are returned unchanged except `value.role` + confidence.
 */
export function classifyColorRoles(tokens: ColorToken[], samples: ElementSample[]): ColorToken[] {
  const usages = collectColorUsages(samples);
  // Match every usage to its owning token by perceptual proximity.
  const byToken = new Map<ColorToken, ColorUsage[]>();
  const normalizedByToken = new Map<ColorToken, NormalizedColor>();
  for (const token of tokens) {
    byToken.set(token, []);
    const normalized = normalizeColorValue(token.value.hex);
    if (normalized) normalizedByToken.set(token, normalized);
  }
  for (const usage of usages) {
    const normalized = normalizeColorValue(usage.value);
    if (!normalized) continue;
    let owner: ColorToken | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const token of tokens) {
      const key = normalizedByToken.get(token);
      if (!key) continue;
      const dist = oklchDistanceBetween(normalized, key);
      if (dist < best) {
        best = dist;
        owner = token;
      }
    }
    // OKLCH ΔE (L 0–1): twice the cluster threshold is enough to attribute a
    // usage to its token; anything farther is not that color (law #5).
    if (owner && best <= 0.08) byToken.get(owner)?.push(usage);
  }

  const statsByToken = new Map<ColorToken, RoleStats>();
  for (const [token, list] of byToken) {
    statsByToken.set(token, buildStats(list));
  }

  // Chromatic brand ranking (primary / secondary / accent).
  const chroma = tokens
    .filter((t) => {
      const n = normalizeColorValue(t.value.hex);
      return n != null && !n.neutral;
    })
    .sort((a, b) => b.usageCount - a.usageCount);

  const maxBackground = Math.max(...tokens.map((t) => statsByToken.get(t)?.background ?? 0));

  return tokens.map((token) => {
    const stats = statsByToken.get(token);
    const normalized = normalizedByToken.get(token);
    if (!stats || !normalized) {
      return { ...token, value: { ...token.value, role: 'unknown' } };
    }
    const total = stats.text + stats.background + stats.border;
    const isNeutral = normalized.neutral;
    const tokenUsages = byToken.get(token) ?? [];

    // 1. Semantic hints win: error > warning > success.
    if (stats.hint === 'error' || stats.hint === 'warning' || stats.hint === 'success') {
      const role = stats.hint;
      return {
        ...token,
        value: { ...token.value, role },
        confidence: inferred(
          role,
          usageBasis(tokenUsages, role),
          Math.min(0.95, 0.5 + stats.text / 8),
        ),
      };
    }

    // 2. Mostly-border tokens.
    if (stats.border > 0 && stats.border / Math.max(1, total) >= 0.6) {
      return {
        ...token,
        value: { ...token.value, role: 'border' },
        confidence: detectedBasis(),
      };
    }

    // 3. Brand colors — heavy button/link usage.
    const brandShare = (stats.buttons + stats.links) / Math.max(1, total);
    if (brandShare >= 0.3 || (total >= 3 && (stats.buttons > 0 || stats.links > 0) && !isNeutral)) {
      const rank = chroma.indexOf(token);
      const chromaValue = normalized.oklchTuple[1];
      const role: ColorRole =
        rank === 0
          ? 'primary'
          : rank === 1
            ? 'secondary'
            : chromaValue >= 0.15
              ? 'accent'
              : 'unknown';
      if (role !== 'unknown') {
        return {
          ...token,
          value: { ...token.value, role },
          confidence: inferred(
            role,
            usageBasis(tokenUsages, role, `ranked #${rank + 1} by usage among brand colors`),
            Math.min(0.95, 0.45 + token.usageCount / 60),
          ),
        };
      }
    }

    // 4. Neutrals: background / surface / text / muted.
    if (isNeutral) {
      const bgShare = stats.background / Math.max(1, total);
      if (bgShare >= 0.5) {
        const isMostUsedBg = stats.background === maxBackground && stats.background > 0;
        const role: ColorRole = isMostUsedBg ? 'background' : 'surface';
        return {
          ...token,
          value: { ...token.value, role },
          confidence:
            stats.background >= 10
              ? detectedBasis()
              : inferred(role, usageBasis(tokenUsages, role), 0.6 + token.usageCount / 100),
        };
      }
      if (stats.text > 0) {
        const role: ColorRole =
          stats.medianTextLength < 24 || token.usageCount <= 2 ? 'muted' : 'text';
        return {
          ...token,
          value: { ...token.value, role },
          confidence: detectedBasis(),
        };
      }
      return { ...token, value: { ...token.value, role: 'unknown' } };
    }

    // 5. Remaining chromatic: mostly-text → text; otherwise accent/unknown.
    const textShare = stats.text / Math.max(1, total);
    if (textShare >= 0.6) {
      return {
        ...token,
        value: { ...token.value, role: 'text' },
        confidence: detectedBasis(),
      };
    }
    if (normalized.oklchTuple[1] >= 0.15) {
      return {
        ...token,
        value: { ...token.value, role: 'accent' },
        confidence: inferred(
          'accent',
          usageBasis(tokenUsages, 'accent'),
          0.5 + token.usageCount / 80,
        ),
      };
    }
    return { ...token, value: { ...token.value, role: 'unknown' } };
  });
}
