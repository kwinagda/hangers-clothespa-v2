const test = require('node:test');
const assert = require('node:assert/strict');
const { compareServiceDisplay, compareServiceSmartDisplay } = require('../src/utils/service-sort');

test('compareServiceDisplay keeps normal garment variants before heavier variants', () => {
  const sorted = [
    { name: 'Blouse-Heavy', sortOrder: 0 },
    { name: 'Blouse-Normal', sortOrder: 0 },
    { name: 'Blouse-Very Heavy', sortOrder: 0 },
  ].sort(compareServiceDisplay);

  assert.deepEqual(sorted.map((item) => item.name), [
    'Blouse-Normal',
    'Blouse-Heavy',
    'Blouse-Very Heavy',
  ]);
});

test('compareServiceDisplay respects DB sortOrder before smart name fallback', () => {
  const sorted = [
    { name: 'Bedsheet (Double)', sortOrder: 8 },
    { name: 'General Ironing', sortOrder: 1 },
    { name: 'Shirt', sortOrder: 2 },
  ].sort(compareServiceDisplay);

  assert.deepEqual(sorted.map((item) => item.name), [
    'General Ironing',
    'Shirt',
    'Bedsheet (Double)',
  ]);
});

test('compareServiceDisplay sorts numeric names naturally and unknown variants consistently', () => {
  const sorted = [
    { name: 'Sofa Cleaning 10 Seater', sortOrder: 0 },
    { name: 'Sofa Cleaning 2 Seater', sortOrder: 0 },
    { name: 'Dress-Woolen', sortOrder: 0 },
    { name: 'Dress-Plain', sortOrder: 0 },
  ].sort(compareServiceDisplay);

  assert.deepEqual(sorted.map((item) => item.name), [
    'Dress-Plain',
    'Dress-Woolen',
    'Sofa Cleaning 2 Seater',
    'Sofa Cleaning 10 Seater',
  ]);
});

test('compareServiceDisplay handles multi-part names by ranking the final variant', () => {
  const sorted = [
    { name: 'Sweater-Full Sleeves-Heavy', sortOrder: 0 },
    { name: 'Sweater-Full Sleeves-Plain', sortOrder: 0 },
    { name: 'Blanket-Double-2 Ply', sortOrder: 0 },
    { name: 'Blanket-Single-Normal', sortOrder: 0 },
    { name: 'Blanket-Double-Normal', sortOrder: 0 },
    { name: 'Blanket-Single-2 Ply', sortOrder: 0 },
    { name: 'Soft Toy-Large', sortOrder: 0 },
    { name: 'Soft Toy-Small', sortOrder: 0 },
    { name: 'Soft Toy-Medium', sortOrder: 0 },
  ].sort(compareServiceDisplay);

  assert.deepEqual(sorted.map((item) => item.name), [
    'Blanket-Single-Normal',
    'Blanket-Single-2 Ply',
    'Blanket-Double-Normal',
    'Blanket-Double-2 Ply',
    'Soft Toy-Small',
    'Soft Toy-Medium',
    'Soft Toy-Large',
    'Sweater-Full Sleeves-Plain',
    'Sweater-Full Sleeves-Heavy',
  ]);
});

test('compareServiceSmartDisplay can recalculate already-populated sort orders', () => {
  const sorted = [
    { name: 'Sweater-Full Sleeves-Heavy', sortOrder: 1 },
    { name: 'Sweater-Full Sleeves-Plain', sortOrder: 2 },
  ].sort(compareServiceSmartDisplay);

  assert.deepEqual(sorted.map((item) => item.name), [
    'Sweater-Full Sleeves-Plain',
    'Sweater-Full Sleeves-Heavy',
  ]);
});
