/**
 * Scraper for arrow-home.cn (箭牌家居 ARROW)
 * Extracts products from all category pages and saves to arrow-products.json
 * 
 * Usage: node scraper-arrow.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Category mapping: URL path → category info
const CATEGORIES = {
  'col3':  { name: '智能坐便器', nameEn: 'Smart Toilet', category: 'Smart Toilet / Bồn cầu thông minh' },
  'col6':  { name: '坐便器', nameEn: 'Toilet', category: 'Toilet / Bồn cầu' },
  'col11': { name: '花洒', nameEn: 'Shower', category: 'Shower / Sen tắm' },
  'col9':  { name: '龙头', nameEn: 'Faucet', category: 'Faucet / Vòi' },
  'col10': { name: '浴缸', nameEn: 'Bathtub', category: 'Bathtub / Bồn tắm' },
  'col5':  { name: '浴室柜', nameEn: 'Bathroom Cabinet', category: 'Bathroom Cabinet / Tủ phòng tắm' },
  'col4':  { name: '定制卫浴', nameEn: 'Custom Bathroom', category: 'Custom Bathroom / Phòng tắm tùy chỉnh' },
  'col7':  { name: '定制淋浴房', nameEn: 'Shower Room', category: 'Shower Room / Phòng tắm đứng' },
  'col8':  { name: '浴霸', nameEn: 'Bath Heater', category: 'Bath Heater / Đèn sưởi' },
  'col50': { name: '智能晾衣架', nameEn: 'Smart Clothes Rack', category: 'Smart Clothes Rack / Giá phơi thông minh' },
  'col52': { name: '水槽', nameEn: 'Kitchen Sink', category: 'Sink / Bồn rửa' },
  'col55': { name: '淋浴花洒', nameEn: 'Shower Set', category: 'Shower Set / Bộ sen tắm' },
  'col56': { name: '五金挂件', nameEn: 'Hardware Accessory', category: 'Accessory / Phụ kiện' },
  'col57': { name: '地漏', nameEn: 'Floor Drain', category: 'Floor Drain / Cống sàn' },
  'col46': { name: '净水器', nameEn: 'Water Purifier', category: 'Water Purifier / Máy lọc nước' },
  'col47': { name: '热水器', nameEn: 'Water Heater', category: 'Water Heater / Máy nước nóng' },
  'col49': { name: '晾衣机', nameEn: 'Drying Rack', category: 'Drying Rack / Giá phơi đồ' },
};

const BASE_URL = 'https://www.arrow-home.cn';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Fetch URL content
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Sleep helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Parse products from a category page HTML
function parseProducts(html, catKey, catInfo) {
  const products = [];
  
  // Match product blocks: <li class="fadeInUp ..."> ... </li>
  const liRegex = /<li\s+class="fadeInUp[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let match;
  
  while ((match = liRegex.exec(html)) !== null) {
    const block = match[1];
    
    // Extract model
    const modelMatch = block.match(/<div\s+class="wycp_model">([^<]+)<\/div>/);
    // Extract name
    const nameMatch = block.match(/<div\s+class="wycp_name">([^<]+)<\/div>/);
    // Extract link
    const linkMatch = block.match(/href="(\/col\d+\/\d+)"/);
    // Extract images
    const pic1Match = block.match(/<img\s+class="wycp_pic1"\s+src="([^"]+)"/);
    const pic2Match = block.match(/<img\s+class="wycp_pic2"\s+src="([^"]+)"/);
    // Extract col/info IDs
    const colMatch = block.match(/<div[^>]*class="wycp_col"[^>]*>(\d+)<\/div>/);
    const infoMatch = block.match(/<div[^>]*class="wycp_info"[^>]*>(\d+)<\/div>/);
    // Extract star/new tag
    const starMatch = block.match(/<span\s+class="wycp_star">([^<]*)<\/span>/);
    
    if (nameMatch) {
      const product = {
        model: modelMatch ? modelMatch[1].trim() : '',
        name: nameMatch[1].trim(),
        category: catInfo.category,
        categoryName: catInfo.name,
        categoryNameEn: catInfo.nameEn,
        cover: pic1Match ? pic1Match[1] : '',
        coverHover: pic2Match ? pic2Match[1] : '',
        detailUrl: linkMatch ? BASE_URL + linkMatch[1] : '',
        colId: colMatch ? parseInt(colMatch[1]) : null,
        productId: infoMatch ? parseInt(infoMatch[1]) : null,
        tag: starMatch ? starMatch[1].trim() : '',
        source: 'arrow-home.cn',
      };
      products.push(product);
    }
  }
  
  return products;
}

// Check if there's a next page
function hasNextPage(html, currentPage) {
  const nextPage = currentPage + 1;
  // Look for link to next page: href="/col3/list_N"
  const pattern = new RegExp(`href="(/col\\d+/list_${nextPage})"`);
  return pattern.test(html);
}

// Get page URL for a category
function getPageUrl(catKey, page) {
  if (page === 1) {
    return `${BASE_URL}/${catKey}/index`;
  }
  return `${BASE_URL}/${catKey}/list_${page}`;
}

// Try to fetch product detail page for specs
async function fetchProductDetail(product) {
  if (!product.detailUrl) return {};
  
  try {
    const html = await fetchUrl(product.detailUrl);
    const specs = {};
    
    // Extract specification table
    const specRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<\/tr>/g;
    let specMatch;
    while ((specMatch = specRegex.exec(html)) !== null) {
      const key = specMatch[1].trim();
      const val = specMatch[2].trim();
      if (key && val && key !== val) {
        specs[key] = val;
      }
    }
    
    // Extract description paragraphs
    const descMatch = html.match(/<div\s+class="[^"]*product.*?desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    let description = '';
    if (descMatch) {
      description = descMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    // Extract all product images from detail
    const detailImages = [];
    const imgRegex = /<img[^>]+src="(https:\/\/res-static\.arrow-home\.cn\/[^"]+)"/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      if (!detailImages.includes(imgMatch[1])) {
        detailImages.push(imgMatch[1]);
      }
    }
    
    return { specs, description, detailImages: detailImages.slice(0, 10) };
  } catch (err) {
    return {};
  }
}

async function main() {
  const allProducts = [];
  const catKeys = Object.keys(CATEGORIES);
  
  console.log(`\n=== ARROW Home Scraper ===`);
  console.log(`Scraping ${catKeys.length} categories...\n`);
  
  for (const catKey of catKeys) {
    const catInfo = CATEGORIES[catKey];
    let page = 1;
    let hasMore = true;
    let catProducts = [];
    
    console.log(`[${catKey}] ${catInfo.name} (${catInfo.nameEn})...`);
    
    while (hasMore) {
      const url = getPageUrl(catKey, page);
      try {
        const html = await fetchUrl(url);
        const products = parseProducts(html, catKey, catInfo);
        
        if (products.length === 0 && page === 1) {
          console.log(`  Page 1: no products found (might be a different layout)`);
          break;
        }
        
        catProducts.push(...products);
        console.log(`  Page ${page}: ${products.length} products`);
        
        // Check next page
        if (hasNextPage(html, page)) {
          page++;
          await sleep(800); // Rate limiting
        } else {
          hasMore = false;
        }
      } catch (err) {
        console.log(`  Page ${page}: ERROR - ${err.message}`);
        hasMore = false;
      }
    }
    
    console.log(`  Total: ${catProducts.length} products\n`);
    allProducts.push(...catProducts);
    
    await sleep(500); // Rate limiting between categories
  }
  
  // Deduplicate by model+name
  const seen = new Set();
  const unique = [];
  for (const p of allProducts) {
    const key = `${p.model}|${p.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total scraped: ${allProducts.length}`);
  console.log(`After dedup: ${unique.length}`);
  
  // Save to file
  const outPath = path.join(__dirname, 'arrow-products.json');
  fs.writeFileSync(outPath, JSON.stringify(unique, null, 2), 'utf8');
  console.log(`\nSaved to: ${outPath}`);
  
  // Print category breakdown
  const catCounts = {};
  for (const p of unique) {
    catCounts[p.category] = (catCounts[p.category] || 0) + 1;
  }
  console.log('\nCategory breakdown:');
  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
}

main().catch(err => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
