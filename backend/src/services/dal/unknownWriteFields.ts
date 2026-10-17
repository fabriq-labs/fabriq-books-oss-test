import { Prisma } from '@prisma/client';
import logger from '../../utils/logger';

/**
 * Names on a write payload that are not scalar, enum, or relation fields.
 * Prisma reports the first key its chosen input type rejects, which can be a
 * real foreign key when another key on the same payload is the unknown one.
 */
export function unknownWriteFields(
  modelName: string,
  data: Record<string, unknown> | null | undefined
): string[] {
  if (!data) return [];
  const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === modelName);
  if (!model) return [];
  const allowed = new Set(model.fields.map((field) => field.name));
  return Object.keys(data).filter((key) => !allowed.has(key));
}

export function unknownWriteFieldsMessage(modelName: string, fields: string[]): string {
  const label = fields.length === 1 ? 'Unknown field' : 'Unknown fields';
  return `${label} on ${modelName}: ${fields.join(', ')}`;
}

export function rejectUnknownWriteFields(
  modelName: string,
  data: Record<string, unknown> | null | undefined
): string | null {
  const fields = unknownWriteFields(modelName, data);
  if (fields.length === 0) return null;
  const message = unknownWriteFieldsMessage(modelName, fields);
  logger.warn('Rejected write with unknown fields', { model: modelName, fields });
  return message;
}
