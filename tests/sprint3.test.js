/**
 * Sprint 3 Tests
 * Tests: compare endpoint, ai-search parseQuery/scoreProduct
 */
const assert = require('assert');
const http = require('http');
const { parseQuery, scoreProduct, KEYWORD_MAP } = require('../ai-search');

let server;
let baseUrl;

async function setup() {
  process.env.PORT = 0;
  const mod = require('../server');
  server = mod.server || mod.app?.listen?.(0) || mod;

  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
    setTimeout(resolve, 1000);
  });

  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
  return mod;
}

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
        } catch {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    }).on('error', reject);
  });
}

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
  console.log('\n🧪 Sprint 3 Tests\n');

  let mod;
  try {
    mod = await setup();
  } catch (e) {
    console.error('Failed to start server:', e.message);
    process.exit(1);
  }

  // Get some real product IDs for compare tests
  const productsRes = await httpGet('/api/products?limit=3');
  const testIds = productsRes.data.products.map(p => p.id);

  // ============================================================
  // 3.1 Compare endpoint
  // ============================================================
  await test('GET /api/compare with 1 product ID', async () => {
    const res = await httpGet(`/api/compare?ids=${testIds[0]}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.count, 1);
    assert.ok(Array.isArray(res.data.products));
    assert.strictEqual(res.data.products.length, 1);
    const p = res.data.products[0];
    assert.ok(p.id !== undefined);
    assert.ok(p.name !== undefined);
    assert.ok(p.sapCode !== undefined);
  });

  await test('GET /api/compare with 2 product IDs', async () => {
    const res = await httpGet(`/api/compare?ids=${testIds[0]},${testIds[1]}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.count, 2);
    assert.strictEqual(res.data.products.length, 2);
  });

  await test('GET /api/compare with 3 product IDs', async () => {
    const res = await httpGet(`/api/compare?ids=${testIds[0]},${testIds[1]},${testIds[2]}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.count, 3);
    assert.strictEqual(res.data.products.length, 3);
  });

  await test('GET /api/compare - max 3 IDs enforced', async () => {
    const res = await httpGet(`/api/compare?ids=${testIds[0]},${testIds[1]},${testIds[2]},99999`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.count <= 3);
  });

  await test('GET /api/compare - missing ids returns 400', async () => {
    const res = await httpGet('/api/compare');
    assert.strictEqual(res.status, 400);
  });

  await test('GET /api/compare - nonexistent ID returns error in result', async () => {
    const res = await httpGet('/api/compare?ids=999999999');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.products[0].error, 'Product not found');
  });

  await test('GET /api/compare - product has all comparison fields', async () => {
    const res = await httpGet(`/api/compare?ids=${testIds[0]}`);
    const p = res.data.products[0];
    assert.ok(p.category !== undefined);
    assert.ok(p.categoryVi !== undefined);
    assert.ok(p.brand !== undefined);
    assert.ok(Array.isArray(p.onlineStatus));
    assert.ok(Array.isArray(p.channels));
    assert.ok(p.cover !== undefined);
    assert.ok(p.shareUrl !== undefined);
  });

  // ============================================================
  // 3.3 ai-search parseQuery accuracy
  // ============================================================
  await test('parseQuery - "sen cây" → Shower category', () => {
    const r = parseQuery('sen cây');
    assert.ok(r.categories.includes('Shower / Sen tắm'));
    assert.ok(r.matched.includes('sen cây'));
  });

  await test('parseQuery - "bồn cầu" → Toilet category', () => {
    const r = parseQuery('bồn cầu');
    assert.ok(r.categories.includes('Toilet / Bồn cầu'));
  });

  await test('parseQuery - "vòi rửa bát rút kéo" → Kitchen faucet + retractable', () => {
    const r = parseQuery('vòi rửa bát rút kéo');
    assert.ok(r.categories.length > 0);
    assert.ok(r.nameKeywords.length > 0);
  });

  await test('parseQuery - "gương đèn LED" → Mirror + LED keywords', () => {
    const r = parseQuery('gương đèn LED');
    assert.ok(r.categories.includes('Mirror Cabinet / Tủ gương'));
    assert.ok(r.nameKeywords.some(k => k.includes('LED') || k.includes('灯')));
  });

  await test('parseQuery - "phụ kiện phòng tắm màu đen" → Accessory + black color', () => {
    const r = parseQuery('phụ kiện phòng tắm màu đen');
    assert.ok(r.categories.includes('Accessory / Phụ kiện'));
    assert.ok(r.attrKeywords.some(k => k.includes('黑')));
  });

  await test('parseQuery - empty query returns empty structure', () => {
    const r = parseQuery('');
    assert.deepStrictEqual(r.categories, []);
    assert.deepStrictEqual(r.matched, []);
    assert.strictEqual(r.confidence, 0);
  });

  await test('parseQuery - Chinese-only input works', () => {
    const r = parseQuery('恒温花洒');
    assert.ok(r.nameKeywords.includes('恒温') || r.nameKeywords.includes('花洒'));
  });

  await test('parseQuery - mixed language input', () => {
    const r = parseQuery('sen tắm 恒温');
    assert.ok(r.matched.includes('sen tắm'));
    assert.ok(r.nameKeywords.includes('恒温'));
  });

  // ============================================================
  // 3.3 ai-search scoreProduct scoring
  // ============================================================
  await test('scoreProduct - category match gives +10', () => {
    const parsed = parseQuery('sen cây');
    const product = { category: 'Shower / Sen tắm', name: 'JOMOO 花洒' };
    const score = scoreProduct(product, parsed);
    assert.ok(score >= 10, `Expected >= 10, got ${score}`);
  });

  await test('scoreProduct - name keyword match gives +3', () => {
    const parsed = parseQuery('sen cây');
    const product = { category: 'Other / Khác', name: 'JOMOO 花洒增压' };
    const score = scoreProduct(product, parsed);
    assert.ok(score >= 3, `Expected >= 3, got ${score}`);
  });

  await test('scoreProduct - no match gives 0', () => {
    const parsed = parseQuery('sen cây');
    const product = { category: 'Toilet / Bồn cầu', name: 'JOMOO 马桶' };
    const score = scoreProduct(product, parsed);
    assert.strictEqual(score, 0);
  });

  await test('scoreProduct - multiple keyword bonus', () => {
    const parsed = parseQuery('sen cây ổn định nhiệt');
    const product = { category: 'Shower / Sen tắm', name: 'JOMOO 恒温花洒增压' };
    const score = scoreProduct(product, parsed);
    // category: 10, 恒温: 3, 花洒: 3, multi bonus: ~4+
    assert.ok(score >= 16, `Expected >= 16, got ${score}`);
  });

  // ============================================================
  // AI Search pagination
  // ============================================================
  await test('AI search /api/ask returns pagination fields', async () => {
    const res = await httpGet('/api/ask?q=sen+cây&limit=10');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.data.total === 'number', 'has total');
    assert.ok(typeof res.data.totalPages === 'number', 'has totalPages');
    assert.ok(typeof res.data.page === 'number', 'has page');
    assert.ok(typeof res.data.limit === 'number', 'has limit');
    assert.ok(res.data.total > 0, 'has results');
  });

  await test('AI search pagination - page 1 vs page 2 differ', async () => {
    const p1 = await httpGet('/api/ask?q=sen+cây&limit=5&page=1');
    const p2 = await httpGet('/api/ask?q=sen+cây&limit=5&page=2');
    assert.strictEqual(p1.data.page, 1);
    assert.strictEqual(p2.data.page, 2);
    // Different products on different pages (unless very few results)
    if (p1.data.total > 5) {
      const ids1 = p1.data.products.map(p => p.id);
      const ids2 = p2.data.products.map(p => p.id);
      const overlap = ids1.filter(id => ids2.includes(id));
      assert.strictEqual(overlap.length, 0, 'pages should not overlap');
    }
  });

  await test('AI search limit respected', async () => {
    const res = await httpGet('/api/ask?q=sen+cây&limit=3');
    assert.ok(res.data.products.length <= 3);
  });

  await test('AI search - attribute keyword matching (color "đen")', async () => {
    const res = await httpGet('/api/ask?q=phụ+kiện+màu+đen&limit=5');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.total > 0, 'should find black accessories');
    assert.ok(res.data.parsed.attrKeywords.some(k => k.includes('黑')), 'should parse black color');
  });

  await test('AI search - feature keyword "tăng áp"', async () => {
    const res = await httpGet('/api/ask?q=sen+tăng+áp&limit=5');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.total > 0, 'should find pressure-boosting showers');
    assert.ok(res.data.parsed.nameKeywords.some(k => k.includes('增压')), 'should parse boost keyword');
  });

  // ============================================================
  // Results
  // ============================================================
  console.log(results.join('\n'));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (server) server.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
