/**
 * Sprint 1 Tests
 * Tests: pre-computed counts, LRU cache, API endpoints
 */
const assert = require('assert');
const http = require('http');

let server;
let baseUrl;

// Start server before tests
async function setup() {
  // Set a random port to avoid conflicts
  process.env.PORT = 0;
  const mod = require('../server');
  server = mod.server || mod.app?.listen?.(0) || mod;

  // Wait for server to be listening
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
    // Also try resolve after a short delay in case it's already listening
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
  console.log('\n🧪 Sprint 1 Tests\n');

  let mod;
  try {
    mod = await setup();
  } catch (e) {
    console.error('Failed to start server:', e.message);
    process.exit(1);
  }

  // ============================================================
  // 1.1 Pre-computed category counts
  // ============================================================
  await test('Category counts are pre-computed on startup', () => {
    assert.ok(Array.isArray(mod.categoryCounts), 'categoryCounts should be an array');
    assert.ok(mod.categoryCounts.length > 0, 'Should have at least one category');
    const first = mod.categoryCounts[0];
    assert.ok(first.name, 'Category should have name');
    assert.ok(typeof first.count === 'number', 'Category should have numeric count');
    assert.ok(first.nameVi, 'Category should have nameVi');
    assert.ok(first.icon, 'Category should have icon');
  });

  await test('Brand counts are pre-computed on startup', () => {
    assert.ok(Array.isArray(mod.brandCounts), 'brandCounts should be an array');
    assert.ok(mod.brandCounts.length > 0, 'Should have at least one brand');
    const first = mod.brandCounts[0];
    assert.ok(first.name, 'Brand should have name');
    assert.ok(typeof first.count === 'number', 'Brand should have numeric count');
  });

  await test('Category counts are sorted descending by count', () => {
    for (let i = 1; i < mod.categoryCounts.length; i++) {
      assert.ok(
        mod.categoryCounts[i - 1].count >= mod.categoryCounts[i].count,
        `Categories should be sorted: ${mod.categoryCounts[i-1].count} >= ${mod.categoryCounts[i].count}`
      );
    }
  });

  // ============================================================
  // 1.2 LRU Cache
  // ============================================================
  await test('LRU cache - module exports productsCache', () => {
    assert.ok(mod.productsCache, 'productsCache should be exported');
    assert.ok(typeof mod.productsCache.get === 'function', 'Should have get method');
    assert.ok(typeof mod.productsCache.set === 'function', 'Should have set method');
  });

  await test('LRU cache - miss returns undefined', () => {
    const result = mod.productsCache.get({ nonexistent: 'key' });
    assert.strictEqual(result, undefined);
  });

  await test('LRU cache - hit returns cached data', () => {
    const params = { test: 'sprint1', page: '1' };
    const data = { total: 42, products: [{ id: 1 }] };
    mod.productsCache.set(params, data);
    const result = mod.productsCache.get(params);
    assert.deepStrictEqual(result, data);
  });

  await test('LRU cache - different params are different keys', () => {
    mod.productsCache.set({ a: '1' }, { x: 1 });
    mod.productsCache.set({ b: '2' }, { y: 2 });
    assert.deepStrictEqual(mod.productsCache.get({ a: '1' }), { x: 1 });
    assert.deepStrictEqual(mod.productsCache.get({ b: '2' }), { y: 2 });
  });

  await test('LRU cache - max size eviction', () => {
    // Create a small cache to test eviction
    const LRUCache = mod.productsCache.constructor;
    const smallCache = new LRUCache(3, 60000);
    smallCache.set({ a: '1' }, 1);
    smallCache.set({ b: '2' }, 2);
    smallCache.set({ c: '3' }, 3);
    smallCache.set({ d: '4' }, 4); // should evict {a: '1'}
    assert.strictEqual(smallCache.get({ a: '1' }), undefined);
    assert.strictEqual(smallCache.get({ d: '4' }), 4);
    assert.strictEqual(smallCache.size, 3);
  });

  // ============================================================
  // API Tests
  // ============================================================
  await test('GET /api/categories returns correct format', async () => {
    const res = await httpGet('/api/categories');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data), 'Should return array');
    assert.ok(res.data.length > 0, 'Should have categories');
    const cat = res.data[0];
    assert.ok(cat.name, 'Category should have name');
    assert.ok(cat.nameVi, 'Category should have nameVi');
    assert.ok(cat.icon, 'Category should have icon');
    assert.ok(typeof cat.count === 'number', 'Category should have count');
  });

  await test('GET /api/brands returns correct format', async () => {
    const res = await httpGet('/api/brands');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length > 0);
    assert.ok(res.data[0].name);
    assert.ok(typeof res.data[0].count === 'number');
  });

  await test('GET /api/products returns paginated results', async () => {
    const res = await httpGet('/api/products?page=1&limit=10');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.data.total === 'number');
    assert.ok(Array.isArray(res.data.products));
    assert.ok(res.data.products.length <= 10);
    assert.strictEqual(res.data.page, 1);
    assert.strictEqual(res.data.limit, 10);
  });

  await test('GET /api/products with category filter', async () => {
    const cats = await httpGet('/api/categories');
    const firstCat = cats.data[0].name;
    const res = await httpGet(`/api/products?category=${encodeURIComponent(firstCat)}&limit=5`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.products.length >= 0);
    // All returned products should be in the filtered category
    for (const p of res.data.products) {
      assert.strictEqual(p.category, firstCat);
    }
  });

  await test('GET /api/products with brand filter', async () => {
    const res = await httpGet('/api/products?brand=Jomoo%20%E4%B9%9D%E7%89%A7&limit=5');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.total > 0, 'Should find Jomoo products');
    // Products with empty brand default to 'Jomoo 九牧' in filter but '' in response
    for (const p of res.data.products) {
      assert.ok(p.brand === 'Jomoo 九牧' || p.brand === '', `Unexpected brand: ${p.brand}`);
    }
  });

  await test('GET /api/products with search query', async () => {
    const res = await httpGet('/api/products?q=Jomoo&limit=5');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.data.total === 'number');
  });

  await test('GET /api/products with multiple filters', async () => {
    const res = await httpGet('/api/products?brand=Jomoo%20%E4%B9%9D%E7%89%A7&status=%E5%9C%A8%E5%B8%82&limit=5');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.products));
  });

  await test('GET /api/status returns correct format', async () => {
    const res = await httpGet('/api/status');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.data.totalProducts === 'number');
    assert.ok(res.data.totalProducts > 0);
    assert.ok(typeof res.data.cacheSize === 'number');
    assert.ok(typeof res.data.uptime === 'number');
  });

  await test('GET /api/products returns correct product shape', async () => {
    const res = await httpGet('/api/products?limit=1');
    assert.strictEqual(res.status, 200);
    if (res.data.products.length > 0) {
      const p = res.data.products[0];
      assert.ok(p.id !== undefined, 'Product should have id');
      assert.ok(p.name !== undefined, 'Product should have name');
      assert.ok(p.sapCode !== undefined, 'Product should have sapCode');
      assert.ok(p.category !== undefined, 'Product should have category');
      assert.ok(Array.isArray(p.onlineStatus), 'Product should have onlineStatus array');
      assert.ok(Array.isArray(p.channels), 'Product should have channels array');
    }
  });

  // ============================================================
  // Results
  // ============================================================
  console.log(results.join('\n'));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  // Cleanup
  if (server) server.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
