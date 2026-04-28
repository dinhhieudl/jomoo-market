/**
 * Batch fetch missing cover images from Jomoo API
 * Updates products.json with covers found from the API
 * 
 * Usage: node fetch-missing-covers.js [batchSize]
 * Default batchSize: 100
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const PRODUCTS_PATH = path.join(__dirname, 'products.json');
const CONCURRENCY = 5;
const DELAY = 300;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchCover(id) {
  try {
    const res = await fetch('https://mobile.jomoo.com/mpm/api/v1/product/share/getProductInfoBase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: String(id) }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data.status && data.detail) {
      const cover = data.detail.cover || '';
      const images = (data.detail.mainImageList || []).map(img => img.path);
      return { cover, images };
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const batchSize = parseInt(process.argv[2]) || 100;
  const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));

  // Find Jomoo products without cover
  const missing = products.filter(p => (!p.source || p.source === 'jomoo') && !p.cover);
  console.log(`Products missing cover: ${missing.length}`);
  console.log(`Fetching up to ${batchSize}...\n`);

  const batch = missing.slice(0, batchSize);
  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (p) => {
      const result = await fetchCover(p.id);
      return { id: p.id, result };
    }));

    for (const { id, result } of results) {
      if (result && result.cover) {
        // Update product in array
        const idx = products.findIndex(p => p.id === id);
        if (idx >= 0) {
          products[idx].cover = result.cover;
          found++;
        }
      } else if (result) {
        notFound++;
      } else {
        errors++;
      }
    }

    const done = Math.min(i + CONCURRENCY, batch.length);
    if (done % 20 === 0 || done === batch.length) {
      console.log(`  Progress: ${done}/${batch.length} (found: ${found}, no cover: ${notFound}, errors: ${errors})`);
    }

    if (i + CONCURRENCY < batch.length) {
      await sleep(DELAY);
    }
  }

  if (found > 0) {
    fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), 'utf8');
    console.log(`\nSaved ${found} new covers to products.json`);
  } else {
    console.log('\nNo new covers found.');
  }

  console.log(`\nSummary: ${found} covers found, ${notFound} still missing, ${errors} errors`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
