/**
 * Phase 2: Fetch product detail specs for all scraped ARROW products
 * Reads arrow-products.json, fetches each detail page, enriches with specs
 * Outputs arrow-products-full.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CONCURRENCY = 3;
const DELAY = 600;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseDetail(html) {
  const specs = {};
  
  // Parse <dl><dt>key：</dt><dd>value</dd></dl>
  const dlRegex = /<dl>\s*<dt>([^<：]+)[：:]?\s*<\/dt>\s*<dd>([^<]*)<\/dd>\s*<\/dl>/g;
  let m;
  while ((m = dlRegex.exec(html)) !== null) {
    const key = m[1].trim().replace(/[：:]/g, '');
    const val = m[2].trim();
    if (key && val) specs[key] = val;
  }
  
  // Extract description images
  const descImages = [];
  const imgRegex = /<img[^>]+src="(https:\/\/res-static\.arrow-home\.cn\/[^"]+)"/g;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    if (!descImages.includes(imgMatch[1])) {
      descImages.push(imgMatch[1]);
    }
  }
  
  // Extract product description text
  const descSection = html.match(/规格参数[\s\S]*?(<div\s+class="info">[\s\S]*?<\/div>\s*<\/div>)/);
  let descText = '';
  if (descSection) {
    descText = descSection[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
  
  return { specs, descImages: descImages.slice(0, 8), descText };
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchUrl(url);
    } catch (err) {
      if (i === retries) throw err;
      await sleep(2000);
    }
  }
}

async function main() {
  const inputPath = path.join(__dirname, 'arrow-products.json');
  const products = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  console.log(`Enriching ${products.length} products with detail specs...`);
  console.log(`Concurrency: ${CONCURRENCY}, Delay: ${DELAY}ms\n`);
  
  let done = 0;
  let errors = 0;
  
  // Process in batches
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (product) => {
      if (!product.detailUrl) return;
      
      try {
        const html = await fetchWithRetry(product.detailUrl);
        const detail = parseDetail(html);
        product.specs = detail.specs;
        product.descImages = detail.descImages;
        product.descText = detail.descText;
        done++;
        
        if (done % 20 === 0) {
          console.log(`  Progress: ${done}/${products.length} (${errors} errors)`);
        }
      } catch (err) {
        errors++;
        product.specs = {};
        product.descImages = [];
        product.descText = '';
      }
    });
    
    await Promise.all(promises);
    if (i + CONCURRENCY < products.length) {
      await sleep(DELAY);
    }
  }
  
  console.log(`\nDone! ${done} enriched, ${errors} errors`);
  
  // Save enriched data
  const outPath = path.join(__dirname, 'arrow-products-full.json');
  fs.writeFileSync(outPath, JSON.stringify(products, null, 2), 'utf8');
  console.log(`Saved to: ${outPath}`);
  
  // Stats
  const withSpecs = products.filter(p => p.specs && Object.keys(p.specs).length > 0).length;
  console.log(`Products with specs: ${withSpecs}/${products.length}`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
