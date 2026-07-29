import {
  BILL_UPLOAD_ACCEPT_ATTR,
  BILL_UPLOAD_HELPER_TEXT,
  buildBillUploadDataUri,
  extensionFromFileName,
  isBillUploadMimeAllowed,
  resolveBillUploadMime,
} from '../../agent/utils/billUploadMime';

describe('billUploadMime', () => {
  test('accepts jpeg with matching mimetype', () => {
    const r = resolveBillUploadMime({
      originalName: 'photo.jpg',
      mimetype: 'image/jpeg',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mime).toBe('image/jpeg');
      expect(r.source).toBe('mimetype');
    }
  });

  test('resolves JPEG from extension when type empty (Android/iPhone)', () => {
    const r = resolveBillUploadMime({
      originalName: 'photo.JPEG',
      mimetype: '',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mime).toBe('image/jpeg');
      expect(r.source).toBe('extension');
    }
  });

  test('resolves HEIC from extension when type empty (iPhone default)', () => {
    const r = resolveBillUploadMime({
      originalName: 'IMG_001.HEIC',
      mimetype: '',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mime).toBe('image/heic');
      expect(r.source).toBe('extension');
    }
  });

  test('resolves HEIC when browser sends octet-stream', () => {
    const r = resolveBillUploadMime({
      originalName: 'receipt.heic',
      mimetype: 'application/octet-stream',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mime).toBe('image/heic');
      expect(r.source).toBe('extension');
    }
  });

  test('resolves HEIF from extension', () => {
    const r = resolveBillUploadMime({
      originalName: 'scan.heif',
      mimetype: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('image/heif');
  });

  test('accepts PDF', () => {
    const r = resolveBillUploadMime({
      originalName: 'bill.pdf',
      mimetype: 'application/pdf',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('application/pdf');
  });

  test('accepts PNG and WebP', () => {
    expect(
      resolveBillUploadMime({ originalName: 'a.png', mimetype: 'image/png' }).ok,
    ).toBe(true);
    expect(
      resolveBillUploadMime({ originalName: 'a.webp', mimetype: 'image/webp' }).ok,
    ).toBe(true);
  });

  test('rejects unsupported types', () => {
    const docx = resolveBillUploadMime({
      originalName: 'notes.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(docx.ok).toBe(false);
    if (!docx.ok) expect(docx.error).toMatch(/Unsupported/i);

    const dng = resolveBillUploadMime({
      originalName: 'raw.dng',
      mimetype: '',
    });
    expect(dng.ok).toBe(false);
  });

  test('buildBillUploadDataUri never uses empty mime', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff]); // jpeg soi
    const uri = buildBillUploadDataUri('image/heic', buf);
    expect(uri.startsWith('data:image/heic;base64,')).toBe(true);
    expect(uri.includes('data:;base64')).toBe(false);
  });

  test('helpers export accept attr and allowlist check', () => {
    expect(BILL_UPLOAD_ACCEPT_ATTR).toContain('.heic');
    expect(BILL_UPLOAD_HELPER_TEXT.toLowerCase()).toContain('heic');
    expect(isBillUploadMimeAllowed('image/jpeg')).toBe(true);
    expect(isBillUploadMimeAllowed('image/tiff')).toBe(false);
    expect(extensionFromFileName('/tmp/IMG_2.Heic')).toBe('heic');
  });
});
