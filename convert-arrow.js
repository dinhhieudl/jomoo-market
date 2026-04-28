/**
 * Convert ARROW scraped data to jomoo-market format
 * Merges with existing products.json
 */

const fs = require('fs');
const path = require('path');

// Load existing products
const existingPath = path.join(__dirname, 'products.json');
const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));

// Load ARROW full data
const arrowPath = path.join(__dirname, 'arrow-products-full.json');
const arrow = JSON.parse(fs.readFileSync(arrowPath, 'utf8'));

// Find max existing ID
const maxId = Math.max(...existing.map(p => p.id), 0);

// Category mapping - ARROW categories to match project format
const CATEGORY_MAP = {
  'Smart Toilet / Bồn cầu thông minh': 'Smart Toilet / Bồn cầu thông minh',
  'Toilet / Bồn cầu': 'Toilet / Bồn cầu',
  'Shower / Sen tắm': 'Shower / Sen tắm',
  'Faucet / Vòi': 'Faucet / Vòi',
  'Bathtub / Bồn tắm': 'Bathtub / Bồn tắm',
  'Bathroom Cabinet / Tủ phòng tắm': 'Bathroom Cabinet / Tủ phòng tắm',
  'Custom Bathroom / Phòng tắm tùy chỉnh': 'Custom Bathroom / Phòng tắm tùy chỉnh',
  'Shower Room / Phòng tắm đứng': 'Shower Room / Phòng tắm đứng',
  'Bath Heater / Đèn sưởi': 'Bath Heater / Đèn sưởi',
  'Sink / Bồn rửa': 'Sink / Bồn rửa',
  'Water Purifier / Máy lọc nước': 'Water Purifier / Máy lọc nước',
  'Water Heater / Máy nước nóng': 'Water Heater / Máy nước nóng',
  'Accessory / Phụ kiện': 'Accessory / Phụ kiện',
  'Floor Drain / Cống sàn': 'Floor Drain / Cống sàn',
};

// Convert ARROW products to project format
const converted = arrow.map((p, i) => {
  // Normalize specs - remove duplicates, clean keys
  const cleanSpecs = {};
  if (p.specs) {
    for (const [k, v] of Object.entries(p.specs)) {
      const cleanKey = k.trim();
      if (cleanKey && v && !cleanKey.includes('品牌名称') && !cleanKey.includes('产品型号')) {
        cleanSpecs[cleanKey] = v.trim();
      }
    }
  }

  return {
    id: maxId + 1 + i,
    name: p.name,
    sapCode: p.model || '',
    category: p.category || 'Other / Khác',
    channels: ['线上销售', '终端销售'],
    onlineStatus: ['在市'],
    cover: p.cover || '',
    shareUrl: p.detailUrl || '',
    // ARROW-specific fields
    source: 'arrow-home.cn',
    brand: 'ARROW 箭牌',
    specs: cleanSpecs,
    descImages: (p.descImages || []).filter(img => 
      img.includes('res-static.arrow-home.cn') && 
      !img.includes('logo') && 
      !img.includes('otherlogo')
    ).slice(0, 5),
    descText: p.descText || '',
    tag: p.tag || '',
  };
});

// Merge
const merged = [...existing, ...converted];

// Save
const outPath = path.join(__dirname, 'products.json');
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf8');

console.log(`\n=== Merge Complete ===`);
console.log(`Existing Jomoo products: ${existing.length}`);
console.log(`ARROW products added: ${converted.length}`);
console.log(`Total products: ${merged.length}`);
console.log(`Saved to: ${outPath}`);

// Category breakdown
const catCounts = {};
for (const p of converted) {
  catCounts[p.category] = (catCounts[p.category] || 0) + 1;
}
console.log('\nARROW categories added:');
for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}

// Sample
console.log('\nSample converted product:');
console.log(JSON.stringify(converted[0], null, 2));
