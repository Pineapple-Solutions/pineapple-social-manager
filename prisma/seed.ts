// prisma/seed.ts — Seed dati iniziali v2 (multi-tenant)

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database v2...');

  // ─── Tenant di default ─────────────────────────────────────────
  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: 'pineapple-home' },
    update: {},
    create: {
      name: 'Pineapple Home',
      slug: 'pineapple-home',
      plan: 'agency',
      isActive: true,
    },
  });
  console.log('✅ Tenant creato:', defaultTenant.slug);

  // ─── Config di default per il tenant ──────────────────────────
  const defaultConfigs = [
    { key: 'timezone', value: 'Europe/Rome' },
    { key: 'defaultLanguage', value: 'it' },
    { key: 'defaultTone', value: 'professional' },
    { key: 'autoPublish', value: 'false' },
    { key: 'notificationsEnabled', value: 'true' },
  ];
  for (const cfg of defaultConfigs) {
    await prisma.tenantConfig.upsert({
      where: { tenantId_key: { tenantId: defaultTenant.id, key: cfg.key } },
      update: {},
      create: { tenantId: defaultTenant.id, ...cfg },
    });
  }

  // ─── Scheduler rule di default ────────────────────────────────
  const existingRule = await prisma.schedulerRule.count({ where: { tenantId: defaultTenant.id } });
  if (existingRule === 0) {
    await prisma.schedulerRule.create({
      data: {
        tenantId: defaultTenant.id,
        name: 'Regola principale',
        description: 'Pubblicazione automatica giornaliera',
        isActive: false,
        contentType: 'MIXED',
        frequency: 'DAILY',
        postsPerDay: 2,
        storiesPerDay: 3,
        reelsPerWeek: 1,
        preferredTimes: JSON.stringify(['09:00', '12:00', '18:00', '20:00']),
        timezone: 'Europe/Rome',
        activeDays: JSON.stringify([1, 2, 3, 4, 5, 6, 0]),
        contentSource: 'AI',
        aiTone: 'professional',
        aiLanguage: 'it',
        aiTopics: JSON.stringify(['smart home', 'automazione', 'domotica', 'design', 'tecnologia', 'lifestyle']),
      },
    });
  }

  // ─── Regole prompt globali di esempio ─────────────────────────
  const existingRules = await prisma.globalPromptRule.count({ where: { tenantId: defaultTenant.id } });
  if (existingRules === 0) {
    await prisma.globalPromptRule.createMany({
      data: [
        {
          tenantId: defaultTenant.id,
          name: 'Brand Voice Pineapple',
          description: 'Tono e stile del brand',
          contentType: 'ALL',
          rule: 'Mantieni sempre un tono caldo, amichevole e professionale. Il brand Pineapple Home è sinonimo di qualità, innovazione e vita smart.',
          isActive: true,
          priority: 10,
        },
        {
          tenantId: defaultTenant.id,
          name: 'Hashtag italiano sempre',
          description: 'Mix hashtag IT e EN',
          contentType: 'HASHTAGS',
          rule: 'Includi sempre almeno 5 hashtag in italiano e 5 in inglese. Usa hashtag specifici per il mercato italiano.',
          isActive: true,
          priority: 5,
        },
      ],
    });
  }

  console.log('✅ Database seeded con successo!');
  console.log('');
  console.log('📌 Accesso master:');
  console.log('   Email:', process.env.MASTER_EMAIL ?? 'admin@pineapplehome.it');
  console.log('   Password:', process.env.MASTER_PASSWORD ?? 'Admin123!');
  console.log('');
  console.log('💡 Per aggiungere provider AI, vai in: Configurazione → Provider AI');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
