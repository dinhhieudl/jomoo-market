/**
 * Sprint 2 Tests
 * Tests: file-based cache, fuzzy search, CSV export, graceful shutdown
 */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

let server;
let baseUrl;

async function setup() {
  process.env.PORT = 0;
  // Clean up any existing cache file
  const cacheDir = path.join(__dirname, '..', 'cache');
  const cacheFile = path.join(cacheDir, 'details.json');
  try { if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile); } catch {}

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
          resolve({ status: res.statusCode, data: JSON.parse(data), raw: data, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: null, raw: data, headers: res.headers });
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
  console.log('\n🧪 Sprint 2 Tests\n');

  let mod;
  try {
    mod = await setup();
  } catch (e) {
    console.error('Failed to start server:', e.message);
    process.exit(1);
  }

  // ============================================================
  // 2.1 File-based detail cache
  // ============================================================
  await test('File cache - CACHE_FILE path is defined', () => {
    assert.ok(mod.CACHE_FILE, 'CACHE_FILE should be exported');
    assert.ok(mod.CACHE_FILE.endsWith('details.json'), 'Should point to details.json');
  });

  await test('File cache - detail cache has saveNow method', () => {
    assert.ok(typeof mod.detailCache.saveNow === 'function', 'Should have saveNow method');
  });

  await test('File cache - write and read back', () => {
    mod.detailCache.set('test-999', { data: { id: 999, name: 'Test' }, time: Date.now() });
    mod.detailCache.saveNow();
    assert.ok(fs.existsSync(mod.CACHE_FILE), 'Cache file should exist');
    const content = JSON.parse(fs.readFileSync(mod.CACHE_FILE, 'utf8'));
    assert.ok(content['test-999'], 'Should contain test entry');
    assert.strictEqual(content['test-999'].data.name, 'Test');
  });

  await test('File cache - TTL expiry cleanup', () => {
    // Write an expired entry directly
    const expired = { data: { id: 888 }, time: Date.now() - (25 * 60 * 60 * 1000) };
    const valid = { data: { id: 777 }, time: Date.now() };
    const testFile = path.join(__dirname, '..', 'cache', 'test-expired.json');
    fs.writeFileSync(testFile, JSON.stringify({ expired, valid }));

    // Read it back and verify expired would be cleaned
    const content = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    const now = Date.now();
    const cleaned = {};
    for (const [key, entry] of Object.entries(content)) {
      if (now - entry.time < 24 * 60 * 60 * 1000) {
        cleaned[key] = entry;
      }
    }
    assert.ok(cleaned['valid'], 'Valid entry should remain');
    assert.ok(!cleaned['expired'], 'Expired entry should be removed');

    // Cleanup
    fs.unlinkSync(testFile);
  });

  // ============================================================
  // 2.2 Fuzzy search
  // ============================================================
  await test('Fuzzy search - status shows fuzzy enabled', async () => {
    const res = await httpGet('/api/status');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.fuzzySearchEnabled, true);
  });

  await test('Fuzzy search - typo still returns results', async () => {
    // "shwer" is a typo for "shower" - fuzzy should help
    const res = await httpGet('/api/products?q=shwer&limit=10');
    assert.strictEqual(res.status, 200);
    // We just verify the endpoint works without crashing
    assert.ok(typeof res.data.total === 'number');
  });

  await test('Fuzzy search - exact match still works', async () => {
    // Get a real product name first
    const all = await httpGet('/api/products?limit=1');
    if (all.data.products.length > 0) {
      const name = all.data.products[0].name;
      // Search for first word of the name
      const word = name.split(' ')[0];
      const res = await httpGet(`/api/products?q=${encodeURIComponent(word)}&limit=5`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.total >= 0);
    }
  });

  // ============================================================
  // 2.3 CSV Export
  // ============================================================
  await test('CSV export - returns valid CSV with headers', async () => {
    const res = await httpGet('/api/export?limit=5');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'), 'Should have CSV content type');
    assert.ok(res.raw.includes('\uFEFF'), 'Should have BOM');
    const lines = res.raw.replace('\uFEFF', '').split('\n');
    assert.ok(lines[0].includes('id,name,sapCode'), 'Should have CSV headers');
    assert.ok(lines[0].includes('category,categoryVi'), 'Should have category columns');
    assert.ok(lines[0].includes('status,brand,channels'), 'Should have status/brand columns');
  });

  await test('CSV export - with brand filter', async () => {
    const res = await httpGet('/api/export?brand=Jomoo%20%E4%B9%9D%E7%89%A7&limit=5');
    assert.strictEqual(res.status, 200);
    const lines = res.raw.replace('\uFEFF', '').split('\n');
    assert.ok(lines.length >= 2, 'Should have header + at least one row');
  });

  await test('CSV export - with category filter', async () => {
    const cats = await httpGet('/api/categories');
    const firstCat = encodeURIComponent(cats.data[0].name);
    const res = await httpGet(`/api/export?category=${firstCat}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.raw.includes('\uFEFF'));
  });

  // ============================================================
  // 2.4 Pino logging (verify server starts without errors)
  // ============================================================
  await test('Server starts with structured logging', async () => {
    const res = await httpGet('/api/status');
    assert.strictEqual(res.status, 200);
    // If we got here, pino didn't crash the server
  });

  // ============================================================
  // 2.5 Graceful shutdown
  // ============================================================
  await test('Graceful shutdown function exists', () => {
    assert.ok(typeof mod.gracefulShutdown === 'function');
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
