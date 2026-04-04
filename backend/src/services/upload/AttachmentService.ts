import prisma from '../../lib/prisma';
import { storageAdapter } from '../dal/storage';
import path from 'path';

const storageFolder = process.env.STORAGE_FOLDER_PATH || 'attachments';

export class AttachmentService {

  //TODO: need the operations to be done in transaction
  static async uploadAttachment(model: string, id: string, file: Express.Multer.File, meta: any = {}) {
    // Compose storage path: <storageFolder>/<model>/<id>/<filename>
    const storagePath = path.join(storageFolder, model, id, file.originalname);
    await storageAdapter.writeFile(file.buffer, storagePath);
    // Create attachment record in DB
    const attachment = await prisma.attachment.create({
      data: {
        path: storagePath,
        instance_id: id,
        type_name: model,
        name: file.originalname,
        ...meta,
      },
    });
    return attachment;
  }

  /**
   * Upload from buffer (e.g. email attachment). Same behaviour as uploadAttachment but takes buffer + filename.
   */
  static async uploadFromBuffer(
    model: string,
    instanceId: string,
    buffer: Buffer,
    filename: string,
    meta: Record<string, unknown> = {}
  ) {
    const storagePath = path.join(storageFolder, model, instanceId, filename);
    await storageAdapter.writeFile(buffer, storagePath);
    const attachment = await prisma.attachment.create({
      data: {
        path: storagePath,
        instance_id: instanceId,
        type_name: model,
        name: filename,
        ...meta,
      },
    });
    return attachment;
  }

  static async listAttachments(model: string, id: string) {
    return prisma.attachment.findMany({
      where: {
        type_name: model,
        instance_id: id,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  static async deleteAttachment(model: string, id: string, attachmentId: string) {
    // Find the attachment
    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.type_name !== model || attachment.instance_id !== id) {
      throw new Error('Attachment not found');
    }
    // Delete file from storage
    await storageAdapter.delete_file(attachment.path);
    // Delete record from DB
    await prisma.attachment.delete({ where: { id: attachmentId } });
    return { success: true };
  }

  static async downloadAttachment(attachmentId: string) {
    // Find the attachment
    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      throw new Error('Attachment not found');
    }
    // Read file from storage
    const fileBuffer = await storageAdapter.readFile(attachment.path);
    return { buffer: fileBuffer, filename: attachment.name, path: attachment.path };
  }

  /**
   * Get the first attachment file for an instance (e.g. instance_email_ingest_item or invoice).
   * Returns { buffer, filename } for streaming/display.
   */
  static async getAttachmentFileByInstance(typeName: string, instanceId: string) {
    const attachment = await prisma.attachment.findFirst({
      where: { type_name: typeName, instance_id: instanceId },
      orderBy: { created_at: 'desc' },
    });
    if (!attachment) {
      throw new Error('Attachment not found');
    }
    const buffer = await storageAdapter.readFile(attachment.path);
    return { buffer, filename: attachment.name };
  }

  /**
   * Reassign attachments from one instance to another (e.g. from instance_email_ingest_item to invoice).
   * Finds all attachments with the given fromType and fromInstanceId, moves each file to the target
   * folder and updates the record to toType and toInstanceId.
   */
  static async reassignAttachments(
    fromType: string,
    fromInstanceId: string,
    toType: string,
    toInstanceId: string,
  ): Promise<number> {
    const attachments = await prisma.attachment.findMany({
      where: {
        type_name: fromType,
        instance_id: fromInstanceId,
      },
    });
    let moved = 0;
    for (const att of attachments) {
      try {
        const buffer = await storageAdapter.readFile(att.path);
        const newPath = path.join(storageFolder, toType, toInstanceId, att.name);
        await storageAdapter.writeFile(buffer, newPath);
        await prisma.attachment.update({
          where: { id: att.id },
          data: { path: newPath, type_name: toType, instance_id: toInstanceId },
        });
        await storageAdapter.delete_file(att.path).catch(() => {});
        moved += 1;
      } catch (err) {
        console.error('reassignAttachments: failed for attachment', att.id, err);
      }
    }
    return moved;
  }
} 