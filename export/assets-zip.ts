/**
 * Bulk asset export (Section 7.10) — pure ZIP assembly with fflate.
 *
 * The background worker fetches each asset (honest CORS handling: failures
 * are collected, never silently dropped), then calls `buildAssetZip` to pack
 * them into `vizquo-assets/<type>/<filename>` plus a `metadata.json` that
 * documents every requested asset and its outcome.
 */
import { strToU8, zipSync } from 'fflate';

/** ZIP shape per the spec: vizquo-assets/{type}/{filename}. */
export const ZIP_ROOT = 'vizquo-assets';

export interface ZipAssetEntry {
  /** Absolute URL this file was fetched from. */
  url: string;
  type: string;
  /** File name inside the ZIP (sanitized, with extension). */
  filename: string;
  bytes: Uint8Array;
  status: 'downloaded' | 'failed';
  reason?: string;
}

export interface AssetZipMetadata {
  /** Page URL the assets came from. */
  pageUrl: string;
  createdAt: number;
  schema: 1;
  totalAssets: number;
  downloaded: number;
  failed: number;
  assets: {
    url: string;
    type: string;
    filename: string;
    status: 'downloaded' | 'failed';
    reason?: string;
    sizeBytes?: number;
  }[];
}

/** Strip path separators and control characters from a suggested filename. */
export function sanitizeFilename(raw: string): string {
  // Control characters are removed by code point (never a regex literal —
  // biome: noControlCharactersInRegex).
  let cleaned = raw.replace(/[\\/:*?"<>|]/g, '-');
  cleaned = [...cleaned]
    .map((ch) => (ch.charCodeAt(0) < 32 ? '-' : ch))
    .join('')
    .trim();
  return cleaned || 'asset';
}

/** Derive a filename from a URL, defaulting the extension by asset type. */
export function filenameForUrl(url: string, type: string, fallbackExt: string): string {
  let name = '';
  try {
    name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  } catch {
    name = '';
  }
  const hasExt = /\.[a-z0-9]{1,6}$/i.test(name);
  if (!hasExt) name = `${name || 'asset'}.${DEFAULT_EXT[type] ?? fallbackExt}`;
  return sanitizeFilename(name);
}

const TYPE_DIR: Record<string, string> = {
  image: 'images',
  svg: 'svgs',
  font: 'fonts',
  video: 'video',
  audio: 'audio',
  lottie: 'lottie',
};

/** The default extension used when a URL has none, per asset type. */
export const DEFAULT_EXT: Record<string, string> = {
  image: 'jpg',
  svg: 'svg',
  font: 'woff2',
  video: 'mp4',
  audio: 'mp3',
  lottie: 'json',
};

/**
 * Assemble the vizquo-assets ZIP. `pageUrl` lands in metadata.json so the
 * archive is self-describing. Pure and deterministic — unit-tested.
 */
export function buildAssetZip(pageUrl: string, entries: ZipAssetEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const metadata: AssetZipMetadata = {
    pageUrl,
    createdAt: Date.now(),
    schema: 1,
    totalAssets: entries.length,
    downloaded: 0,
    failed: 0,
    assets: [],
  };

  for (const entry of entries) {
    const typeDir = TYPE_DIR[entry.type] ?? 'assets';
    const path = `${ZIP_ROOT}/${typeDir}/${entry.filename}`;
    metadata.assets.push({
      url: entry.url,
      type: entry.type,
      filename: entry.filename,
      status: entry.status,
      reason: entry.reason,
      sizeBytes: entry.bytes.byteLength,
    });
    if (entry.status === 'downloaded' && entry.bytes.byteLength > 0) {
      metadata.downloaded += 1;
      files[path] = entry.bytes;
    } else {
      metadata.failed += 1;
    }
  }

  files[`${ZIP_ROOT}/metadata.json`] = strToU8(JSON.stringify(metadata, null, 2));
  return zipSync(files, { level: 6 });
}
