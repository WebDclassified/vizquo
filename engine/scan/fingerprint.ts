/**
 * Cheap page fingerprint for the L3 persistent cache (Section 2.3).
 *
 * Unlike the L2 snapshot hash (computed by the analysis worker after the full
 * DOM walk), this fingerprint is cheap to compute up front — a few stylesheet
 * reads and one element count — so the side panel can decide "is this the
 * same page I scanned before?" BEFORE running the full engine. An unchanged
 * page then loads from the L3 cache near-instantly.
 *
 * Signals: normalized URL + title + reachable stylesheet hrefs + a bounded
 * sample of their CSS text + element count + top-level child tags. Anything a
 * design scan depends on (styles, structure, identity) is covered; ephemeral
 * noise (scroll position, live timestamps in text) is not.
 */
import { fnv1a } from '../../storage/adapters/indexeddb/cache';

/** Cap on total stylesheet text hashed — the fingerprint stays cheap on huge pages. */
const MAX_CSS_SAMPLE_CHARS = 64 * 1024;
/** Cap on top-level children hashed (structure signature). */
const MAX_TOP_LEVEL_TAGS = 32;

function sheetHrefs(doc: Document): string[] {
  const hrefs: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      const href = sheet.href;
      if (href) hrefs.push(href);
    } catch {
      // Unreadable sheet — its href is irrelevant to the fingerprint.
    }
  }
  return hrefs.sort();
}

/** Bounded sample of the page's own CSS text (author + injected styles). */
function cssSample(doc: Document): string {
  let sample = '';
  for (const sheet of Array.from(doc.styleSheets)) {
    if (sample.length >= MAX_CSS_SAMPLE_CHARS) break;
    let text = '';
    try {
      void sheet.cssRules;
      // Serialize every rule's cssText — the ground truth the scan parses.
      const walk = (list: CSSRuleList): void => {
        for (const rule of Array.from(list)) {
          if (sample.length + text.length >= MAX_CSS_SAMPLE_CHARS) break;
          try {
            text += `${rule.cssText}\n`;
          } catch {
            // Some rules (e.g. cross-origin @import chains) refuse cssText.
          }
          if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
            try {
              walk((rule as CSSGroupingRule).cssRules);
            } catch {
              // Unreadable nested rules — skip.
            }
          }
        }
      };
      walk(sheet.cssRules);
    } catch {
      // Cross-origin / CSP-blocked sheet — skipped, not bypassed (Section 4).
    }
    sample += text;
  }
  return sample.slice(0, MAX_CSS_SAMPLE_CHARS);
}

/** Bounded structural signature: count + top-level tag names. */
function structureSignature(doc: Document): string {
  const topLevel: string[] = [];
  for (const child of Array.from(doc.body?.children ?? [])) {
    if (topLevel.length >= MAX_TOP_LEVEL_TAGS) break;
    topLevel.push(child.tagName.toLowerCase());
  }
  let count = 0;
  try {
    count = doc.getElementsByTagName('*').length;
  } catch {
    count = 0;
  }
  return `${count}:${topLevel.join(',')}`;
}

/**
 * Compute the L3 fingerprint for a document. Pure (takes a Document) so the
 * same code runs in the content script and in unit tests (happy-dom).
 */
export function computePageFingerprint(doc: Document): string {
  const parts = [
    doc.location?.href ?? '',
    doc.title,
    sheetHrefs(doc).join('\n'),
    cssSample(doc),
    structureSignature(doc),
  ];
  return fnv1a(parts.join('\u0000'));
}
