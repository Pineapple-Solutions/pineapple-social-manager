const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function clean() {
  await p.aIGenerationLog.deleteMany();
  await p.tikTokMetrics.deleteMany();
  await p.facebookMetrics.deleteMany();
  await p.instagramMetrics.deleteMany();
  await p.generationJob.deleteMany();
  await p.mediaAsset.deleteMany();
  await p.contentIdea.deleteMany();
  await p.videoGenerationJob.deleteMany();
  await p.scheduledPost.deleteMany();
  await p.schedulerRule.deleteMany();
  await p.campaign.deleteMany();
  await p.connectedSite.deleteMany();
  await p.instagramAccount.deleteMany();
  await p.tikTokAccount.deleteMany();
  await p.facebookAccount.deleteMany();
  await p.globalPromptRule.deleteMany();
  await p.aIProviderConfig.deleteMany();
  await p.tenantConfig.deleteMany();
  await p.session.deleteMany();
  await p.userTenant.deleteMany();
  await p.user.deleteMany();
  await p.config.deleteMany();
  await p.tenant.deleteMany();
  console.log('✅ DB MySQL pulito correttamente');
  await p.$disconnect();
}
clean().catch(e => { console.error(e); process.exit(1); });

