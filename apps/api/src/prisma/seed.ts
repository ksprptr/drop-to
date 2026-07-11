import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { databaseConfig } from '@/config/database.config';

import { PrismaClient } from './generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: databaseConfig().url,
});

const prisma = new PrismaClient({ adapter });

/**
 * Function representing a seeding script for a database using Prisma ORM
 */
async function main() {
  // No seed data required — the DriveAccount and AllowedFolders are created
  // at runtime through the Google OAuth + Picker setup flow.
}

main()
  .then(async () => await prisma.$disconnect())
  .catch(async (error) => {
    console.error(`Error during seeding: ${error}`);

    await prisma.$disconnect();

    process.exit(1);
  });
