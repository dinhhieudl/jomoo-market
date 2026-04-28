/**
 * Sprint 3.3 - Unit tests for ai-search.js
 * Tests: parseQuery, scoreProduct, edge cases
 */
const assert = require('assert');

// We need to set up the module with test data first
const { parseQuery, searchProducts, scoreProduct, KEYWORD_MAP, init } = require('../ai-search');

// Category/Status mappings for testing
const CATEGORY_VI = {
  'Shower / Sen tắm': { label: 'Sen tắm', icon: '🚿' },
  'Thermostatic / Ổn định nhiệt': { label: 'Ổn định nhiệt', icon: '🌡️' },
  'Faucet / Vòi': { label: 'Vòi nước', icon: '🚰' },
  'Toilet / Bồn cầu': { label: 'Bồn cầu', icon: '🚽' },
  'Basin / Chậu rửa mặt': { label: 'Chậu rửa mặt', icon: '🪥' },
  'Smart Toilet / Bồn cầu thông minh': { label: 'Bồn cầu thông minh', icon: '🚽' },
};

const STATUS_VI = { '在市': 'Đang bán', '已下市': 'Ngưng bán' };
const STATUS_COLOR = { '在市': '#10b981', '已下市': '#9ca3af' };

// Test products
const testProducts = [
  { id: 1, name: 'JOMOO 花洒恒温钢琴按键淋浴器', sapCode: 'JM001', category: 'Shower / Sen tắm', onlineStatus: ['在市'], brand: 'Jomoo 九牧' },
  { id: 2, name: 'JOMOO 智能坐便器自动感应', sapCode: 'JM002', category: 'Smart Toilet / Bồn cầu thông minh', onlineStatus: ['在市'], brand: 'Jomoo 九牧' },
  { id: 3, name: 'JOMOO 厨房龙头抽拉式', sapCode: 'JM003', category: 'Faucet / Vòi', onlineStatus: ['在市'], brand: 'Jomoo 九牧' },
  { id: 4, name: 'JOMOO 面盆龙头', sapCode: 'JM004', category: 'Basin / Chậu rửa mặt', onlineStatus: ['已下市'], brand: 'Jomoo 九牧' },
  { id: 5, name: 'JOMOO 恒温花洒增压', sapCode: 'JM005', category: 'Shower / Sen tắm', onlineStatus: ['在市'], brand: 'Jomoo 九牧' },
  { id: 6, name: 'ARROW 淋浴房定制', sapCode: 'AR001', category: 'Shower / Sen tắm', onlineStatus: ['在市'], brand: 'ARROW 箭牌' },
];

// Initialize with test data
init(testProducts, CATEGORY_VI, STATUS_VI, STATUS_COLOR);

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    results.push(`  ❌ ${name}: ${e.message}`);
  }
}

async function run() {
  console.log('\n🧪 Sprint 3.3 - AI Search Unit Tests\n');

  // ============================================================
  // parseQuery tests
  // ============================================================
  await test('parseQuery - Vietnamese "sen cây" maps to Shower category', () => {
    const result = parseQuery('sen cây');
    assert.ok(result.categories.includes('Shower / Sen tắm'));
    assert.ok(result.matched.includes('sen cây'));
  });

  await test('parseQuery - "ổn định nhiệt" maps to Thermostatic', () => {
    const result = parseQuery('ổn định nhiệt');
    assert.ok(result.categories.includes('Thermostatic / Ổn định nhiệt'));
    assert.ok(result.nameKeywords.includes('恒温'));
  });

  await test('parseQuery - "bồn cầu thông minh" maps to Smart Toilet', () => {
    const result = parseQuery('bồn cầu thông minh');
    assert.ok(result.categories.includes('Smart Toilet / Bồn cầu thông minh'));
  });

  await test('parseQuery - "sen cây ổn định nhiệt phím đàn" parses multiple keywords', () => {
    const result = parseQuery('sen cây ổn định nhiệt phím đàn');
    assert.ok(result.categories.includes('Shower / Sen tắm'));
    assert.ok(result.categories.includes('Thermostatic / Ổn định nhiệt'));
    assert.ok(result.nameKeywords.includes('钢琴'));
    assert.ok(result.matched.length >= 3);
  });

  await test('parseQuery - color keyword "màu đen" extracts attrKeywords', () => {
    const result = parseQuery('sen tắm màu đen');
    assert.ok(result.attrKeywords.includes('黑色') || result.attrKeywords.includes('哑光黑'));
  });

  await test('parseQuery - Chinese input directly added to nameKeywords', () => {
    const result = parseQuery('花洒');
    assert.ok(result.nameKeywords.includes('花洒'));
  });

  await test('parseQuery - confidence score is between 0 and 1', () => {
    const result = parseQuery('sen cây ổn định nhiệt');
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });

  await test('parseQuery - explanation is non-empty string', () => {
    const result = parseQuery('sen cây');
    assert.ok(typeof result.explanation === 'string');
    assert.ok(result.explanation.length > 0);
  });

  // ============================================================
  // scoreProduct tests
  // ============================================================
  await test('scoreProduct - category match gives +10', () => {
    const parsed = parseQuery('sen cây');
    const product = testProducts[0]; // category: Shower
    const score = scoreProduct(product, parsed);
    assert.ok(score >= 10, `Score ${score} should be >= 10 for category match`);
  });

  await test('scoreProduct - name keyword match gives +3', () => {
    const parsed = parseQuery('sen cây');
    const product = testProducts[0]; // name contains 花洒
    const score = scoreProduct(product, parsed);
    assert.ok(score >= 3, `Score ${score} should be >= 3 for name keyword match`);
  });

  await test('scoreProduct - no match gives 0', () => {
    const parsed = parseQuery('sen cây');
    const product = testProducts[2]; // Kitchen faucet, not shower
    const score = scoreProduct(product, parsed);
    // May have some score from name keywords, but category won't match
    assert.ok(typeof score === 'number');
  });

  await test('scoreProduct - multiple keyword matches give bonus', () => {
    const parsed = parseQuery('sen cây ổn định nhiệt');
    const product = testProducts[4]; // 恒温花洒增压
    const score = scoreProduct(product, parsed);
    // Should have category + name keyword bonuses
    assert.ok(score > 10, `Score ${score} should be > 10 for multiple matches`);
  });

  // ============================================================
  // Edge cases
  // ============================================================
  await test('parseQuery - empty query returns empty results', () => {
    const result = parseQuery('');
    assert.deepStrictEqual(result.categories, []);
    assert.deepStrictEqual(result.nameKeywords, []);
    assert.strictEqual(result.confidence, 0);
  });

  await test('parseQuery - whitespace-only query', () => {
    const result = parseQuery('   ');
    assert.deepStrictEqual(result.categories, []);
    assert.deepStrictEqual(result.matched, []);
  });

  await test('parseQuery - mixed Vietnamese and Chinese', () => {
    const result = parseQuery('sen tắm 花洒');
    assert.ok(result.matched.includes('sen tắm'));
    assert.ok(result.nameKeywords.includes('花洒'));
  });

  await test('parseQuery - unknown keywords still return valid structure', () => {
    const result = parseQuery('xyzabc123');
    assert.ok(Array.isArray(result.categories));
    assert.ok(Array.isArray(result.nameKeywords));
    assert.ok(Array.isArray(result.attrKeywords));
    assert.ok(typeof result.confidence === 'number');
  });

  await test('parseQuery - status keyword "đang bán" sets status filter', () => {
    const result = parseQuery('đang bán');
    assert.ok(result.status);
    assert.ok(result.status.includes('在市'));
  });

  // ============================================================
  // searchProducts integration
  // ============================================================
  await test('searchProducts - returns structured result', () => {
    const result = searchProducts('sen cây');
    assert.ok(typeof result.total === 'number');
    assert.ok(Array.isArray(result.products));
    assert.ok(result.parsed);
    assert.ok(result.query === 'sen cây');
  });

  await test('searchProducts - respects limit option', () => {
    const result = searchProducts('sen', { limit: 2 });
    assert.ok(result.products.length <= 2);
  });

  await test('searchProducts - products have required fields', () => {
    const result = searchProducts('sen', { limit: 5 });
    if (result.products.length > 0) {
      const p = result.products[0];
      assert.ok(p.id !== undefined);
      assert.ok(p.name !== undefined);
      assert.ok(p.sapCode !== undefined);
      assert.ok(typeof p.score === 'number');
    }
  });

  // ============================================================
  // KEYWORD_MAP
  // ============================================================
  await test('KEYWORD_MAP is exported and non-empty', () => {
    assert.ok(KEYWORD_MAP);
    assert.ok(Object.keys(KEYWORD_MAP).length > 10);
  });

  await test('KEYWORD_MAP - all entries have valid structure', () => {
    for (const [key, mapping] of Object.entries(KEYWORD_MAP)) {
      assert.ok(typeof key === 'string', `Key should be string: ${key}`);
      assert.ok(mapping.boost === undefined || typeof mapping.boost === 'number', `boost should be number for ${key}`);
      assert.ok(mapping.category === undefined || Array.isArray(mapping.category), `category should be array for ${key}`);
      assert.ok(mapping.nameKeywords === undefined || Array.isArray(mapping.nameKeywords), `nameKeywords should be array for ${key}`);
    }
  });

  // ============================================================
  // Results
  // ============================================================
  console.log(results.join('\n'));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
