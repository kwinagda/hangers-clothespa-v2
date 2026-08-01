import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';

const prisma = new PrismaClient();
const require = createRequire(import.meta.url);
const {
  collapseSpaces,
  normalizeCustomerPhone,
  normalizeCustomerName,
  normalizeCustomerTag,
  normalizeNullableText,
  normalizePreferredLanguage,
} = require('../src/utils/customer-normalization.js');

const DRY_RUN = process.env.DRY_RUN !== '0';
const LIMIT = Number(process.env.LIMIT || 0);

const changed = (a, b) => (a ?? null) !== (b ?? null);

const buildUpdate = (customer, phoneOwners) => {
  const update = {};
  const normalizedPhone = normalizeCustomerPhone(customer.phone);
  if (normalizedPhone && normalizedPhone !== customer.phone) {
    const ownerId = phoneOwners.get(normalizedPhone);
    if (!ownerId || ownerId === customer.id) update.phone = normalizedPhone;
  }

  const normalizedName = normalizeCustomerName(customer.name);
  if (changed(customer.name, normalizedName)) update.name = normalizedName;

  const normalizedTag = normalizeCustomerTag(customer.tag);
  if (changed(customer.tag, normalizedTag)) update.tag = normalizedTag;

  const normalizedLanguage = normalizePreferredLanguage(customer.preferredLanguage);
  if (changed(customer.preferredLanguage, normalizedLanguage)) update.preferredLanguage = normalizedLanguage;

  const normalizedNotes = normalizeNullableText(customer.notes);
  if (changed(customer.notes, normalizedNotes)) update.notes = normalizedNotes;

  const normalizedMapLocation = normalizeNullableText(customer.mapLocation);
  if (changed(customer.mapLocation, normalizedMapLocation)) update.mapLocation = normalizedMapLocation;

  return update;
};

const main = async () => {
  const customers = await prisma.customer.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      phone: true,
      name: true,
      tag: true,
      preferredLanguage: true,
      notes: true,
      mapLocation: true,
    },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });

  const phoneOwners = new Map(customers.map((customer) => [collapseSpaces(customer.phone), customer.id]));
  const updates = [];
  const phoneConflicts = [];

  for (const customer of customers) {
    const normalizedPhone = normalizeCustomerPhone(customer.phone);
    if (normalizedPhone && normalizedPhone !== customer.phone) {
      const ownerId = phoneOwners.get(normalizedPhone);
      if (ownerId && ownerId !== customer.id) {
        phoneConflicts.push({ id: customer.id, phone: customer.phone, normalizedPhone, ownerId });
      }
    }

    const update = buildUpdate(customer, phoneOwners);
    if (Object.keys(update).length) {
      updates.push({ customer, update });
    }
  }

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    scanned: customers.length,
    updates: updates.length,
    phoneConflicts: phoneConflicts.length,
    samples: updates.slice(0, 12).map(({ customer, update }) => ({
      id: customer.id,
      before: {
        phone: customer.phone,
        name: customer.name,
        tag: customer.tag,
        preferredLanguage: customer.preferredLanguage,
      },
      update,
    })),
    conflictSamples: phoneConflicts.slice(0, 12),
  }, null, 2));

  if (DRY_RUN) return;

  for (const { customer, update } of updates) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: update,
    });
  }

  console.log(`Normalized ${updates.length} customer record${updates.length === 1 ? '' : 's'}.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
