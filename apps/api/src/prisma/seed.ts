import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { databaseConfig } from '@/config/database.config';

import { PrismaClient } from './generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: databaseConfig().url,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  // No seed data required — accounts/folders are created at runtime via the OAuth + Picker flow.
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (error) => {
    console.error(`Error during seeding: ${error}`);

    await prisma.$disconnect();

    process.exit(1);
  });
