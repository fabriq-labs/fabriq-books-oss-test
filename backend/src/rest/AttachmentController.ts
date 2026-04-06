import { Response } from 'express';
import { AttachmentService } from '../services/upload/AttachmentService';
import { AuthRequest } from './RestService';
import logger from '../utils/logger';

export const AttachmentController = {
  async upload(req: AuthRequest, res: Response) {
    try {      
      const model = req.url.split('/')[1] || '';
      const id = req.params.id;
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
      const meta = {
        created_by: req.context?.auth?.user?.id,
        org_id: req.context?.auth?.user?.org_id,
      };
      const attachment = await AttachmentService.uploadAttachment(model, id, file, meta);
      res.json({ data: attachment, message: 'Attachment uploaded successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to upload attachment' });
    }
  },

  async list(req: AuthRequest, res: Response) {
    try {
      const model = req.url.split('/')[1];
      const id = req.params.id;
      const attachments = await AttachmentService.listAttachments(model, id);
      res.json({ data: attachments });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list attachments' });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      const model = req.url.split('/')[1];
      const id = req.params.id;
      const attachmentId = req.params.attachmentId;
      await AttachmentService.deleteAttachment(model, id, attachmentId);
      const attachments = await AttachmentService.listAttachments(model, id);
      res.json({ data: attachments, message: 'Attachment deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete attachment' });
    }
  },

  async download(req: AuthRequest, res: Response) {
    try {
      const attachmentId = req.params.attachmentId;
      const { buffer, filename } = await AttachmentService.downloadAttachment(attachmentId);
      // Set headers for download
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error: any) {
      res.status(404).json({ error: error.message || 'Attachment not found' });
    }
  },

  /**
   * Reassign attachments from one instance to another (generic).
   * POST /attachments/reassign
   * Body: { fromType, fromInstanceId, toType, toInstanceId }
   */
  async reassign(req: AuthRequest, res: Response) {
    try {
      const { fromType, fromInstanceId, toType, toInstanceId } = req.body ?? {};
      if (
        !fromType || typeof fromType !== 'string' ||
        !fromInstanceId || typeof fromInstanceId !== 'string' ||
        !toType || typeof toType !== 'string' ||
        !toInstanceId || typeof toInstanceId !== 'string'
      ) {
        return res.status(400).json({
          error: 'Missing or invalid body. Required: fromType, fromInstanceId, toType, toInstanceId (strings)',
        });
      }
      const moved = await AttachmentService.reassignAttachments(
        fromType,
        fromInstanceId,
        toType,
        toInstanceId,
      );
      res.status(200).json({ success: true, moved });
    } catch (error: any) {
      logger.error('attachments/reassign failed', { error: error?.message });
      res.status(500).json({ error: error?.message || 'Failed to reassign attachments' });
    }
  },
}; 