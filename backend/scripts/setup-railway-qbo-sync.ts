/**
 * One-shot: ensure QBO source_system + payment_terms for dbt on Railway.
 * Preserves datalake. Loads DATABASE_URL / ERP_CONFIG_ENCRYPTION_KEY from env.
 *
 *   cd backend && npm run setup:railway-qbo-sync
 */
import prisma from '../src/lib/prisma';

async function main() {
  const org = await prisma.org.findFirst({
    where: { id: 'org_kernel' },
    select: { id: true },
  });
  if (!org) throw new Error('org_kernel missing — run setup:kernel / seed first');

  const hq = await prisma.entity.findFirst({
    where: { org_id: org.id, is_headquarters: true },
    select: { id: true },
  });

  const connection = await prisma.source_system.upsert({
    where: {
      org_id_system_type: {
        org_id: org.id,
        system_type: 'quickbooks',
      },
    },
    create: {
      org_id: org.id,
      system_type: 'quickbooks',
      name: 'QuickBooks Online',
      is_active: true,
      entity_id: hq?.id ?? null,
      connection_config: {
        oauth: {
          client_id: process.env.QBO_CLIENT_ID || 'placeholder',
          client_secret: process.env.QBO_CLIENT_SECRET || 'placeholder',
          refresh_token: process.env.QBO_REFRESH_TOKEN || 'placeholder',
          realm_id: process.env.QBO_REALM_ID || 'placeholder',
          environment: (process.env.QBO_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
        },
      },
      created_by: 'setup:railway-qbo-sync',
    },
    update: {
      is_active: true,
      entity_id: hq?.id ?? undefined,
      name: 'QuickBooks Online',
    },
  });

  // Optional Airbyte extraction_config from env
  const abConn = process.env.AIRBYTE_CONNECTION_ID || process.env.AIRBYTE_CONNECTION_ID_QUICKBOOKS;
  const abId = process.env.AIRBYTE_CLIENT_ID;
  const abSecret = process.env.AIRBYTE_CLIENT_SECRET;
  if (abConn && abId && abSecret) {
    await prisma.source_system.update({
      where: { id: connection.id },
      data: {
        extraction_config: {
          type: 'airbyte',
          client_id: abId,
          client_secret: abSecret,
          connection_id: abConn,
          api_base: process.env.AIRBYTE_API_BASE || 'https://api.airbyte.com',
        },
      },
    });
    console.log('extraction_config set from env');
  } else {
    console.log('AIRBYTE_* incomplete — skip extraction_config (dbt transform_only still works)');
  }

  // Seed payment_terms from datalake.qb_terms when empty
  const existingTerms = await prisma.payment_terms.count({ where: { org_id: org.id } });
  if (existingTerms === 0) {
    const terms = await prisma.$queryRawUnsafe<
      Array<{ Id: string; Name: string; DueDays: number | null }>
    >(`SELECT "Id", "Name", "DueDays" FROM datalake.qb_terms WHERE coalesce("Active", true) = true`);
    for (const t of terms) {
      if (!t.Name) continue;
      await prisma.payment_terms.create({
        data: {
          org_id: org.id,
          name: t.Name,
          days: t.DueDays == null ? null : Number(t.DueDays),
          entity_id: hq?.id ?? null,
          source_system_id: connection.id,
          source_record_id: String(t.Id),
          is_active: true,
        },
      });
    }
    console.log(`seeded ${terms.length} payment_terms from qb_terms`);
  } else {
    console.log(`payment_terms already present (${existingTerms})`);
  }

  console.log(
    JSON.stringify(
      {
        org_id: org.id,
        source_system_id: connection.id,
        entity_id: hq?.id ?? null,
        has_extraction: Boolean(abConn && abId && abSecret),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
