import QRCode from 'qrcode';
import JSZip from 'jszip';
import type { Location } from '../types/inventory';

const FILENAME_NAME_MAX = 80;
const CHUNK_YIELD_EVERY = 15;

const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

/** Safe segment for archive entry names (Windows-safe). */
export function sanitizeFileName(name: string, maxLen: number = FILENAME_NAME_MAX): string {
  let s = name.replace(INVALID_FILE_CHARS, '-').replace(/\s+/g, ' ').trim() || 'unnamed';
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function buildLocationQrEntryName(loc: Location): string {
  const num = loc.locationNumber?.trim() || 'no-number';
  const safeName = sanitizeFileName(loc.name);
  return `QR__${safeName}__${num}__${loc.id}.png`;
}

function yieldToMainFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export type ZipProgress = (completed: number, total: number) => void;

/**
 * PNG QR codes (payload = Firestore location id), matching checkout scans.
 * Error level H, width 200 — aligned with LocationDashboard single QR defaults.
 */
export async function buildAllLocationQrZip(
  locations: Location[],
  onProgress?: ZipProgress
): Promise<Blob> {
  const zip = new JSZip();
  const total = locations.length;

  for (let i = 0; i < total; i++) {
    const loc = locations[i];
    const dataUrl = await QRCode.toDataURL(loc.id, {
      errorCorrectionLevel: 'H',
      width: 200,
      margin: 4,
      color: { dark: '#171717', light: '#ffffff' },
    });
    const base64 = dataUrl.split(',')[1];
    if (!base64) {
      throw new Error(`Failed to generate QR PNG for location ${loc.id}`);
    }
    zip.file(buildLocationQrEntryName(loc), base64, { base64: true });
    onProgress?.(i + 1, total);
    if ((i + 1) % CHUNK_YIELD_EVERY === 0) {
      await yieldToMainFrame();
    }
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function downloadZipBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function zipDownloadFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `location-qr-codes-${y}-${m}-${day}.zip`;
}
