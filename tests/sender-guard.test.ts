/**
 * Sender-validation guards (Requirements §15/§16, INV-007): privileged
 * background handlers must only accept messages from an extension PAGE, and
 * content-script-only handlers must only accept messages from a tab's own
 * content script. These pure predicates back the live worker guards; the
 * panel path + payload caps are exercised in the Chrome-based torture suite
 * (TOR-029).
 */
import { describe, expect, it } from 'vitest';
import {
  isContentScriptSender,
  isExtensionPageSender,
  requireExtensionPage,
  type SenderLike,
} from '../shared/sender-guard';

const EXT_ID = 'abc123def';
const PAGE_PREFIX = `chrome-extension://${EXT_ID}/`;

const panel: SenderLike = { id: EXT_ID, url: `${PAGE_PREFIX}sidepanel.html` };
const windowPage: SenderLike = { id: EXT_ID, url: `${PAGE_PREFIX}window.html` };
const contentScript: SenderLike = {
  id: EXT_ID,
  url: 'https://example.com/',
  tab: { id: 7 },
};
const noSender: SenderLike | undefined = undefined;

describe('isExtensionPageSender', () => {
  it('accepts side panel and detachable-window senders', () => {
    expect(isExtensionPageSender(panel, EXT_ID, PAGE_PREFIX)).toBe(true);
    expect(isExtensionPageSender(windowPage, EXT_ID, PAGE_PREFIX)).toBe(true);
  });

  it('rejects content-script senders (hostile page context)', () => {
    expect(isExtensionPageSender(contentScript, EXT_ID, PAGE_PREFIX)).toBe(false);
  });

  it('rejects missing, spoofed, and foreign-extension senders', () => {
    expect(isExtensionPageSender(noSender, EXT_ID, PAGE_PREFIX)).toBe(false);
    expect(isExtensionPageSender({ id: 'evil', url: PAGE_PREFIX }, EXT_ID, PAGE_PREFIX)).toBe(
      false,
    );
    expect(
      isExtensionPageSender({ id: EXT_ID, url: 'https://evil.com/' }, EXT_ID, PAGE_PREFIX),
    ).toBe(false);
  });

  it('rejects senders with no URL or non-string url', () => {
    expect(isExtensionPageSender({ id: EXT_ID }, EXT_ID, PAGE_PREFIX)).toBe(false);
    expect(isExtensionPageSender({ id: EXT_ID, url: undefined }, EXT_ID, PAGE_PREFIX)).toBe(false);
  });
});

describe('isContentScriptSender', () => {
  it('accepts a content-script sender with a tab', () => {
    expect(isContentScriptSender(contentScript, EXT_ID)).toBe(true);
  });

  it('rejects extension pages, foreign ids, and tab-less senders', () => {
    expect(isContentScriptSender(panel, EXT_ID)).toBe(false);
    expect(isContentScriptSender({ ...contentScript, id: 'evil' }, EXT_ID)).toBe(false);
    expect(isContentScriptSender({ id: EXT_ID, url: 'https://example.com/' }, EXT_ID)).toBe(false);
    expect(isContentScriptSender(noSender, EXT_ID)).toBe(false);
  });
});

describe('requireExtensionPage', () => {
  it('returns null for the panel and a refusal string otherwise', () => {
    expect(requireExtensionPage(panel, EXT_ID, PAGE_PREFIX, 'AI explanation')).toBeNull();
    expect(requireExtensionPage(contentScript, EXT_ID, PAGE_PREFIX, 'AI explanation')).toContain(
      'only available from the Vizquo side panel',
    );
    expect(requireExtensionPage(noSender, EXT_ID, PAGE_PREFIX, 'Asset export')).toContain(
      'only available from the Vizquo side panel',
    );
  });
});
