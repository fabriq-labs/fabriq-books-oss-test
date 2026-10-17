import { Prisma } from '@prisma/client';
import logger from '../../utils/logger';

/**
 * Prisma rejects a write when any key is not on the model. A single unknown
 * field (for example a column that exists only in another app) makes the
 * client report a confusing error about a real foreign key on the same payload.
 * Drop keys that are not scalar, enum, or relation fields. createMany still
 * receives scalar foreign keys; this does not rewrite them into connect.
 */
export function omitUnknownWriteFields(
  modelName: string,
  data: Record<string, unknown> | null | undefined
): string[] {
  if (!data) return [];
  const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === modelName);
  if (!model) return [];
  const allowed = new Set(model.fields.map((field) => field.name));
  const dropped: string[] = [];
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) {
      delete data[key];
      dropped.push(key);
    }
  }
  if (dropped.length > 0) {
    logger.debug('Dropped unknown write fields', { model: modelName, fields: dropped });
  }
  return dropped;
}
