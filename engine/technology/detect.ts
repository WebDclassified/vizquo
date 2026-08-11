/**
 * Technology detection (Section 7.14) — runs in the content script.
 *
 * Detection is DOM-only by design: the content script lives in an isolated
 * world, so page globals (`window.React`, `__NEXT_DATA__`, …) are NOT
 * visible. What IS visible: attributes, class names, script/link srcs, and
 * generated markup. Markers are labeled by strength — a `data-reactroot`
 * attribute or a `#__NEXT_DATA__` script is `detected`; a class-name
 * heuristic is `probable`; an empty page is `unknown` (never fabricated).
 */
import type { Technology, TechnologyConfidence } from '../../shared/types';

interface Marker {
  name: string;
  category: Technology['category'];
  /** Direct DOM marker — strong evidence. */
  detect?: (doc: Document, facts: DomFacts) => boolean;
  /** Heuristic — weaker evidence, gets `probable`. */
  probable?: (doc: Document, facts: DomFacts) => boolean;
}

/**
 * One DOM walk shared by every marker (Section 4: no redundant full-tree
 * passes). Collects just the facts markers need: class names (capped) and
 * whether any attribute name carries a `data-v-` prefix (Vue scoped styles
 * emit `data-v-<hash>` names, which a `[data-v-]` selector can't match).
 */
interface DomFacts {
  classes: Set<string>;
  hasDataVPrefix: boolean;
}

function collectDomFacts(doc: Document): DomFacts {
  const classes = new Set<string>();
  let hasDataVPrefix = false;
  for (const el of doc.querySelectorAll<HTMLElement>('*')) {
    if (el.classList.length > 0 && classes.size < 400) {
      for (const cls of el.classList) {
        if (classes.size >= 400) break;
        classes.add(cls);
      }
    }
    if (!hasDataVPrefix) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-v-')) {
          hasDataVPrefix = true;
          break;
        }
      }
    }
  }
  return { classes, hasDataVPrefix };
}

const MARKERS: Marker[] = [
  {
    name: 'React',
    category: 'frontend',
    detect: (doc) =>
      doc.querySelector('[data-reactroot]') !== null ||
      Array.from(doc.scripts).some((s) => /react(\.development)?\.js|react-dom/.test(s.src)),
    probable: (doc) => {
      const root = doc.getElementById('root');
      return root !== null && root.children.length > 0;
    },
  },
  {
    name: 'Next.js',
    category: 'frontend',
    detect: (doc) =>
      doc.getElementById('__NEXT_DATA__') !== null ||
      Array.from(doc.scripts).some((s) => /\/_next\/static\//.test(s.src)),
  },
  {
    name: 'Vue',
    category: 'frontend',
    detect: (_doc, facts) => facts.hasDataVPrefix,
    probable: (doc) => {
      const root = doc.getElementById('app');
      return root !== null && root.children.length > 0;
    },
  },
  {
    name: 'Nuxt',
    category: 'frontend',
    detect: (doc) =>
      doc.getElementById('__NUXT_DATA__') !== null || doc.querySelector('#__nuxt') !== null,
  },
  {
    name: 'Angular',
    category: 'frontend',
    detect: (doc) => doc.querySelector('[ng-version]') !== null,
  },
  {
    name: 'Svelte',
    category: 'frontend',
    detect: (doc) =>
      doc.querySelector('[data-svelte-h]') !== null ||
      Array.from(doc.scripts).some((s) => /svelte/.test(s.src)),
  },
  {
    name: 'Astro',
    category: 'frontend',
    detect: (doc) =>
      Array.from(doc.scripts).some((s) => /astro/.test(s.src) || /_astro\//.test(s.src)),
  },
  {
    name: 'Remix',
    category: 'frontend',
    detect: (doc) => Array.from(doc.scripts).some((s) => /remix/.test(s.src)),
  },
  {
    name: 'Tailwind CSS',
    category: 'styling',
    detect: (doc) =>
      Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).some((l) =>
        /tailwindcss|tailwind/.test(l.href),
      ) || doc.querySelector('style[data-tailwind]') !== null,
    probable: (_doc, facts) => {
      // Utility-class families are distinctive: spacing/color prefixes + bare layout words.
      const utilities = [...facts.classes].filter((c) =>
        /^(p|m|px|py|mx|my|mt|mb|ml|mr|gap|w|h|text|bg|flex|grid|items|justify|rounded|shadow|border|block|inline|hidden|relative|absolute|fixed)(-[a-zA-Z0-9_]+)?$/.test(
          c,
        ),
      );
      return utilities.length >= 8 && facts.classes.has('flex');
    },
  },
  {
    name: 'Bootstrap',
    category: 'styling',
    detect: (doc) =>
      Array.from(doc.styleSheets).some((sheet) => /bootstrap/.test(sheet.href ?? '')) ||
      Array.from(doc.scripts).some((s) => /bootstrap/.test(s.src)),
    probable: (doc) =>
      doc.querySelector('.container, .row, [class*="col-md-"], [class*="col-lg-"]') !== null,
  },
  {
    name: 'CSS Modules',
    category: 'styling',
    probable: (_doc, facts) => {
      let found = 0;
      for (const cls of facts.classes) {
        if (/^[A-Za-z0-9_-]+_[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/.test(cls)) {
          found += 1;
          if (found >= 3) return true;
        }
      }
      return false;
    },
  },
  {
    name: 'jQuery',
    category: 'frontend',
    detect: (doc) => Array.from(doc.scripts).some((s) => /jquery/.test(s.src)),
  },
  {
    name: 'GSAP',
    category: 'frontend',
    detect: (doc) => Array.from(doc.scripts).some((s) => /gsap/.test(s.src)),
  },
  {
    name: 'Three.js',
    category: 'frontend',
    detect: (doc) =>
      Array.from(doc.scripts).some((s) => /three(\.min)?\.js|three@/.test(s.src)) ||
      doc.querySelector('canvas[data-engine="three.js"]') !== null,
  },
  {
    name: 'WordPress',
    category: 'platform',
    detect: (doc) =>
      Array.from(doc.querySelectorAll<HTMLLinkElement>('link')).some((l) =>
        /wp-content|wp-includes/.test(l.href),
      ) || doc.querySelector('meta[name="generator"][content*="WordPress"]') !== null,
  },
  {
    name: 'Shopify',
    category: 'platform',
    detect: (doc) =>
      Array.from(doc.scripts).some((s) => /cdn\.shopify\.com/.test(s.src)) ||
      Array.from(doc.querySelectorAll<HTMLLinkElement>('link')).some((l) =>
        /cdn\.shopify\.com/.test(l.href),
      ),
  },
  {
    name: 'Wix',
    category: 'platform',
    detect: (doc) => Array.from(doc.scripts).some((s) => /static\.wixstatic\.com|wix/.test(s.src)),
  },
];

/** Detect technologies from the live DOM. */
export function detectTechnologies(doc: Document): Technology[] {
  const facts = collectDomFacts(doc);
  const found: Technology[] = [];
  for (const marker of MARKERS) {
    let confidence: TechnologyConfidence | null = null;
    if (marker.detect?.(doc, facts)) confidence = 'detected';
    else if (marker.probable?.(doc, facts)) confidence = 'probable';
    if (confidence) {
      found.push({ name: marker.name, category: marker.category, confidence });
    }
  }
  return found;
}
