import prisma from '../../lib/prisma';

export async function resolveBrokerConnection(orgId: string, connectionId?: string) {
  return connectionId
    ? prisma.source_system.findFirst({
        where: { id: connectionId, org_id: orgId, is_active: true, system_type: 'questrade' },
      })
    : prisma.source_system.findFirst({
        where: { org_id: orgId, system_type: 'questrade', is_active: true },
      });
}
