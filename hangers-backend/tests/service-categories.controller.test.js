const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/database');
const { getServices, createServiceCategory } = require('../src/controllers/services.controller');

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('main categories persist without items and reject collisions', async (t) => {
  const original = {
    serviceFindMany: prisma.service.findMany,
    serviceFindFirst: prisma.service.findFirst,
    categoryFindMany: prisma.serviceCategory.findMany,
    categoryFindFirst: prisma.serviceCategory.findFirst,
    categoryCreate: prisma.serviceCategory.create,
  };
  let savedCategories = [];
  let serviceCollision = null;
  let categoryCollision = null;

  prisma.service.findMany = async () => [{ id: 'item-1', name: 'Shirt', category: 'Dry Clean', basePrice: 80, sortOrder: 1 }];
  prisma.service.findFirst = async () => serviceCollision;
  prisma.serviceCategory.findMany = async () => savedCategories.map((name) => ({ name }));
  prisma.serviceCategory.findFirst = async () => categoryCollision;
  prisma.serviceCategory.create = async ({ data }) => {
    const category = { id: 'category-1', ...data };
    savedCategories.push(category.name);
    return category;
  };

  t.after(async () => {
    prisma.service.findMany = original.serviceFindMany;
    prisma.service.findFirst = original.serviceFindFirst;
    prisma.serviceCategory.findMany = original.categoryFindMany;
    prisma.serviceCategory.findFirst = original.categoryFindFirst;
    prisma.serviceCategory.create = original.categoryCreate;
    await prisma.$disconnect();
  });

  const created = makeResponse();
  await createServiceCategory({ body: { name: '  Home Care  ' } }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.data.category.name, 'Home Care');
  assert.equal(created.body.data.category.normalizedName, 'home care');

  const listed = makeResponse();
  await getServices({ query: {} }, listed);
  assert.deepEqual(listed.body.data.catalog, [
    { category: 'Dry Clean', items: [{ id: 'item-1', name: 'Shirt', price: 80, sortOrder: 1 }] },
    { category: 'Home Care', items: [] },
  ]);

  categoryCollision = { id: 'category-1' };
  const duplicate = makeResponse();
  await createServiceCategory({ body: { name: 'home care' } }, duplicate);
  assert.equal(duplicate.statusCode, 409);

  categoryCollision = null;
  serviceCollision = { id: 'item-1' };
  const existingServiceCategory = makeResponse();
  await createServiceCategory({ body: { name: 'dry clean' } }, existingServiceCategory);
  assert.equal(existingServiceCategory.statusCode, 409);

  const invalid = makeResponse();
  await createServiceCategory({ body: { name: '   ' } }, invalid);
  assert.equal(invalid.statusCode, 400);
});
