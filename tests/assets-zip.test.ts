import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildAssetZip,
  DEFAULT_EXT,
  filenameForUrl,
  sanitizeFilename,
  ZIP_ROOT,
  type ZipAssetEntry,
} from '../export/assets-zip';

describe('filenameForUrl', () => {
  it('keeps existing extensions and drops query strings', () => {
    expect(filenameForUrl('https://x.com/logo.svg?v=2', 'svg', 'bin')).toBe('logo.svg');
    expect(filenameForUrl('https://x.com/a/b/photo.webp', 'image', 'jpg')).toBe('photo.webp');
  });

  it('defaults the extension by asset type when the URL has none', () => {
    expect(filenameForUrl('https://x.com/anim', 'lottie', 'bin')).toBe(
      `anim.${DEFAULT_EXT.lottie}`,
    );
    expect(filenameForUrl('https://x.com/clip', 'video', 'bin')).toBe(`clip.${DEFAULT_EXT.video}`);
  });

  it('falls back to "asset" for empty paths', () => {
    expect(filenameForUrl('https://x.com/', 'image', 'bin')).toBe(`asset.${DEFAULT_EXT.image}`);
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators and control characters', () => {
    expect(sanitizeFilename('../../evil\\name:*.png')).toBe('..-..-evil-name--.png');
    expect(sanitizeFilename('')).toBe('asset');
  });
});

describe('buildAssetZip (Section 7.10 bulk export)', () => {
  it('packs downloaded assets under vizquo-assets/<type>/ and writes metadata.json', () => {
    const entries: ZipAssetEntry[] = [
      {
        url: 'https://x.com/hero.png',
        type: 'image',
        filename: 'hero.png',
        bytes: new TextEncoder().encode('PNG'),
        status: 'downloaded',
      },
      {
        url: 'https://x.com/logo.svg',
        type: 'svg',
        filename: 'logo.svg',
        bytes: new TextEncoder().encode('<svg/>'),
        status: 'downloaded',
      },
      {
        url: 'https://blocked.example.com/x.png',
        type: 'image',
        filename: 'x.png',
        bytes: new Uint8Array(),
        status: 'failed',
        reason: 'CORS blocked',
      },
    ];
    const zip = buildAssetZip('https://example.com/test', entries);
    const files = unzipSync(zip);

    expect(files[`${ZIP_ROOT}/images/hero.png`]).toBeDefined();
    expect(files[`${ZIP_ROOT}/svgs/logo.svg`]).toBeDefined();
    expect(files[`${ZIP_ROOT}/images/x.png`]).toBeUndefined();

    const metadata = JSON.parse(strFromU8(files[`${ZIP_ROOT}/metadata.json`]!)) as {
      pageUrl: string;
      totalAssets: number;
      downloaded: number;
      failed: number;
      assets: { url: string; status: string; reason?: string }[];
    };
    expect(metadata.pageUrl).toBe('https://example.com/test');
    expect(metadata.totalAssets).toBe(3);
    expect(metadata.downloaded).toBe(2);
    expect(metadata.failed).toBe(1);
    const blocked = metadata.assets.find((a) => a.url === 'https://blocked.example.com/x.png');
    expect(blocked?.status).toBe('failed');
    expect(blocked?.reason).toBe('CORS blocked');
  });

  it('writes an empty-failure archive when every fetch fails', () => {
    const zip = buildAssetZip('https://example.com/', [
      {
        url: 'https://x.com/a.png',
        type: 'image',
        filename: 'a.png',
        bytes: new Uint8Array(),
        status: 'failed',
        reason: 'CORS blocked',
      },
    ]);
    const files = unzipSync(zip);
    const metadata = JSON.parse(strFromU8(files[`${ZIP_ROOT}/metadata.json`]!)) as {
      downloaded: number;
      failed: number;
    };
    expect(metadata.downloaded).toBe(0);
    expect(metadata.failed).toBe(1);
    // No asset file was written, only metadata.
    expect(Object.keys(files)).toEqual([`${ZIP_ROOT}/metadata.json`]);
  });
});
