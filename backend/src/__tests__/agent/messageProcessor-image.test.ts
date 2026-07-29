import * as fs from 'fs';
import * as path from 'path';
import {
  isImageMimeForVision,
  processMessages,
} from '../../agent/utils/messageProcessor';
import { buildBillUploadDataUri } from '../../agent/utils/billUploadMime';

const RECEIPTS = path.join(__dirname, '../../../test-data/receipts');

describe('messageProcessor image vs file parts', () => {
  test('isImageMimeForVision covers receipt allowlist', () => {
    expect(isImageMimeForVision('image/jpeg')).toBe(true);
    expect(isImageMimeForVision('image/heic')).toBe(true);
    expect(isImageMimeForVision('application/pdf')).toBe(false);
    expect(isImageMimeForVision('')).toBe(false);
  });

  test('JPEG uploaded as type:file becomes type:image with image field', () => {
    const buf = fs.readFileSync(path.join(RECEIPTS, 'sample-receipt.jpg'));
    const dataUri = buildBillUploadDataUri('image/jpeg', buf);
    const [msg] = processMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract' },
          {
            type: 'file',
            data: dataUri,
            mimeType: 'image/jpeg',
            name: 'sample-receipt.jpg',
          },
        ],
      },
    ]);

    expect(Array.isArray(msg.content)).toBe(true);
    const parts = msg.content as any[];
    expect(parts[0]).toEqual({ type: 'text', text: 'Extract' });
    expect(parts[1].type).toBe('image');
    expect(parts[1].image).toBeInstanceOf(Uint8Array);
    expect(parts[1].image.length).toBe(buf.length);
    expect(parts[1].mimeType).toBe('image/jpeg');
    expect(parts[1].data).toBeUndefined();
  });

  test('PDF stays type:file with data + filename', () => {
    const fakePdf = Buffer.from('%PDF-1.4 fake');
    const dataUri = `data:application/pdf;base64,${fakePdf.toString('base64')}`;
    const [msg] = processMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: dataUri,
            mimeType: 'application/pdf',
            name: 'bill.pdf',
          },
        ],
      },
    ]);

    const part = (msg.content as any[])[0];
    expect(part.type).toBe('file');
    expect(part.data).toBeInstanceOf(Uint8Array);
    expect(part.mimeType).toBe('application/pdf');
    expect(part.filename).toBe('bill.pdf');
  });
});
