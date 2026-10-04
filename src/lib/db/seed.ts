/**
 * CLI: load demo data into an empty database.  `npm run seed`
 */
import { getDb } from './index';
import { seedDemoData, DEMO_ACCOUNTS, DEMO_PASSWORD } from './demo-data';

async function main() {
  if (process.env.DATABASE_URL && process.env.SEED_DATABASE !== 'yes') {
    // Seed data includes accounts with a known password. Never load it into a
    // shared database by accident (e.g. after `vercel env pull`).
    throw new Error('DATABASE_URL is set. Re-run with SEED_DATABASE=yes to seed that database.');
  }

  if (!(await seedDemoData(getDb()))) {
    console.log('Database already has users, skipping.');
    return;
  }

  console.log('Database seeded successfully!\n');
  console.log(`Test accounts (all use password: ${DEMO_PASSWORD}):`);
  for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(9)} ${a.email.padEnd(24)} ${a.note}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
