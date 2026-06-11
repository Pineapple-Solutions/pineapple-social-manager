// src/lib/db.ts
// Singleton Prisma Client

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Helper: get config value
export async function getConfigValue(key: string): Promise<string | null> {
  try {
    const config = await prisma.config.findUnique({ where: { key } });
    return config?.value ?? null;
  } catch {
    return null;
  }
}

// Helper: set config value
export async function setConfigValue(key: string, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// Helper: get multiple config values
export async function getConfigValues(keys: string[]): Promise<Record<string, string>> {
  const configs = await prisma.config.findMany({
    where: { key: { in: keys } },
  });
  return Object.fromEntries(configs.map((c) => [c.key, c.value]));
}

