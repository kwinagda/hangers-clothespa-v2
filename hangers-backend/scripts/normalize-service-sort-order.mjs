import dotenv from 'dotenv';
import { createRequire } from 'node:module';

dotenv.config();

const require = createRequire(import.meta.url);
const prisma = require('../src/config/database');
const { compareServiceDisplay, compareServiceSmartDisplay } = require('../src/utils/service-sort');

const dryRun = process.argv.includes('--dry-run');
const forceSmart = process.argv.includes('--force-smart');
const PRESERVE_MANUAL_SORT_CATEGORIES = new Set(['DAILY_IRON']);

const normalizeServiceSortOrder = async () => {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    select: {
      id: true,
      category: true,
      name: true,
      sortOrder: true,
    },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  const grouped = new Map();
  for (const service of services) {
    if (!grouped.has(service.category)) grouped.set(service.category, []);
    grouped.get(service.category).push(service);
  }

  const changes = [];
  for (const [category, items] of grouped.entries()) {
    const comparator = forceSmart && !PRESERVE_MANUAL_SORT_CATEGORIES.has(category)
      ? compareServiceSmartDisplay
      : compareServiceDisplay;
    const sorted = [...items].sort(comparator);
    sorted.forEach((service, index) => {
      const nextSortOrder = index + 1;
      if (Number(service.sortOrder || 0) !== nextSortOrder) {
        changes.push({
          id: service.id,
          category,
          name: service.name,
          from: service.sortOrder || 0,
          to: nextSortOrder,
        });
      }
    });
  }

  if (!changes.length) {
    console.log('Service sort order is already normalized.');
    return;
  }

  console.log(`Service sort order changes: ${changes.length}`);
  for (const change of changes.slice(0, 60)) {
    console.log(`${change.category}: ${change.name} ${change.from} -> ${change.to}`);
  }
  if (changes.length > 60) console.log(`...and ${changes.length - 60} more`);

  if (dryRun) {
    console.log('Dry run only. No database changes were written.');
    return;
  }

  await prisma.$transaction(
    changes.map((change) => prisma.service.update({
      where: { id: change.id },
      data: { sortOrder: change.to },
    })),
  );

  console.log('Service sort order normalized.');
};

normalizeServiceSortOrder()
  .catch((error) => {
    console.error('Failed to normalize service sort order:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
