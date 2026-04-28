const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const { parseQuery, searchProducts, init: initAI } = require('./ai-search');

const app = express();
const PORT = process.env.PORT || 8765;

// ============================================================
// RATE LIMITING
// ============================================================
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// ============================================================
// LRU CACHE (manual, no external deps)
// ============================================================
class LRUCache {
  constructor(maxSize = 100, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.map = new Map(); // insertion-order map
  }

  _makeKey(params) {
    // Sort params for consistent cache keys
    const sorted = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(sorted);
  }

  get(params) {
    const key = this._makeKey(params);
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.time > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.data;
  }

  set(params, data) {
    const key = this._makeKey(params);
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { data, time: Date.now() });
    // Evict oldest if over capacity
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

const productsCache = new LRUCache(100, 5 * 60 * 1000);

// Vietnamese category mapping (must be before product loading for pre-computation)
const CATEGORY_VI = {
  'Shower / Sen tắm': { label: 'Sen tắm', icon: '🚿' },
  'Thermostatic / Ổn định nhiệt': { label: 'Ổn định nhiệt', icon: '🌡️' },
  'Faucet / Vòi': { label: 'Vòi nước', icon: '🚰' },
  'Toilet / Bồn cầu': { label: 'Bồn cầu', icon: '🚽' },
  'Basin / Chậu rửa mặt': { label: 'Chậu rửa mặt', icon: '🪥' },
  'Bathtub / Bồn tắm': { label: 'Bồn tắm', icon: '🛁' },
  'Bidet / Vòi xịt': { label: 'Vòi xịt', icon: '💧' },
  'Shelf / Giá để đồ': { label: 'Giá để đồ', icon: '🗄️' },
  'Towel Rack / Khăn tắm': { label: 'Khăn tắm', icon: '🧖' },
  'Mirror Cabinet / Tủ gương': { label: 'Tủ gương', icon: '🪞' },
  'Bathroom Cabinet / Tủ phòng tắm': { label: 'Tủ phòng tắm', icon: '🚪' },
  'Drain / Thoát nước': { label: 'Thoát nước', icon: '🔽' },
  'Floor Drain / Cống sàn': { label: 'Cống sàn', icon: '🕳️' },
  'Angle Valve / Van góc': { label: 'Van góc', icon: '🔧' },
  'Water Heater / Máy nước nóng': { label: 'Máy nước nóng', icon: '🔥' },
  'Water Purifier / Máy lọc nước': { label: 'Máy lọc nước', icon: '🚰' },
  'Smart / Thông minh': { label: 'Thông minh', icon: '🤖' },
  'Handheld / Cầm tay': { label: 'Cầm tay', icon: '✋' },
  'Overhead / Sen trần': { label: 'Sen trần', icon: '🌧️' },
  'Kitchen / Nhà bếp': { label: 'Nhà bếp', icon: '🍳' },
  'Sink / Bồn rửa': { label: 'Bồn rửa', icon: '🫧' },
  'Laundry / Giặt giũ': { label: 'Giặt giũ', icon: '👕' },
  'Accessory / Phụ kiện': { label: 'Phụ kiện', icon: '🔩' },
  'Other / Khác': { label: 'Khác', icon: '📦' },
  // ARROW categories
  'Smart Toilet / Bồn cầu thông minh': { label: 'Bồn cầu thông minh', icon: '🚽' },
  'Custom Bathroom / Phòng tắm tùy chỉnh': { label: 'Phòng tắm tùy chỉnh', icon: '🏗️' },
  'Shower Room / Phòng tắm đứng': { label: 'Phòng tắm đứng', icon: '🚿' },
  'Bath Heater / Đèn sưởi': { label: 'Đèn sưởi', icon: '♨️' },
};

// Vietnamese status mapping
const STATUS_VI = {
  '在市': 'Đang bán',
  '已下市': 'Ngưng bán',
  '已停产': 'Ngưng sản xuất',
  '内部在市': 'Nội bộ',
  '临时上市': 'Tạm thời',
  '项目定制': 'Dự án riêng',
};

// Status color mapping
const STATUS_COLOR = {
  '在市': '#10b981',
  '已下市': '#9ca3af',
  '已停产': '#ef4444',
  '内部在市': '#f59e0b',
  '临时上市': '#3b82f6',
  '项目定制': '#8b5cf6',
};

// ============================================================
// LOAD PRODUCTS & PRE-COMPUTE COUNTS
// ============================================================
let products = [];
let categoryCounts = [];
let brandCounts = [];
const detailCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

try {
  const raw = fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8');
  products = JSON.parse(raw);
  console.log(`Loaded ${products.length} products`);

  // Pre-compute category counts (1.1)
  const catMap = {};
  for (const p of products) {
    const cat = p.category || 'Other / Khác';
    catMap[cat] = (catMap[cat] || 0) + 1;
  }
  categoryCounts = Object.entries(catMap)
    .map(([name, count]) => ({
      name,
      nameVi: CATEGORY_VI[name]?.label || name.split(' / ')[1] || name,
      icon: CATEGORY_VI[name]?.icon || '📦',
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Pre-compute brand counts (1.1)
  const brandMap = {};
  for (const p of products) {
    const brand = p.brand || 'Jomoo 九牧';
    brandMap[brand] = (brandMap[brand] || 0) + 1;
  }
  brandCounts = Object.entries(brandMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
} catch (e) {
  console.error('Failed to load products.json:', e.message);
}

// Initialize AI search with data and mappings
initAI(products, CATEGORY_VI, STATUS_VI, STATUS_COLOR);

// Proxy endpoint for Arrow images (CDN requires Referer header)
app.get('/api/img-proxy', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('Missing url param');

  let decoded;
  try {
    decoded = decodeURIComponent(rawUrl);
  } catch {
    decoded = rawUrl;
  }
  if (!decoded.includes('res-static.arrow-home.cn') && !decoded.includes('arrow-home.cn')) {
    return res.status(403).send('Only arrow-home.cn images allowed');
  }

  try {
    const proxyRes = await fetch(decoded, {
      headers: {
        'Referer': 'https://www.arrow-home.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!proxyRes.ok) {
      return res.status(proxyRes.status).send(`Upstream returned ${proxyRes.status}`);
    }

    const contentType = proxyRes.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');

    const buffer = await proxyRes.buffer();
    res.send(buffer);
  } catch (err) {
    console.error('Image proxy error:', err.message);
    res.status(502).send('Proxy error');
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/categories - pre-computed counts (1.1)
app.get('/api/categories', (req, res) => {
  res.json(categoryCounts);
});

// GET /api/brands - pre-computed counts (1.1)
app.get('/api/brands', (req, res) => {
  res.json(brandCounts);
});

// GET /api/products - list/filter products with LRU cache (1.2)
app.get('/api/products', (req, res) => {
  const { q, category, status, channel, brand, page = 1, limit = 50 } = req.query;

  // Check LRU cache
  const cached = productsCache.get(req.query);
  if (cached) {
    return res.json(cached);
  }

  let filtered = products;

  if (q) {
    const lower = q.toLowerCase();
    filtered = filtered.filter(p =>
      (p.name || '').toLowerCase().includes(lower) ||
      (p.sapCode || '').toLowerCase().includes(lower)
    );
  }

  if (category) {
    const cats = category.split(',');
    filtered = filtered.filter(p => cats.includes(p.category));
  }

  if (status) {
    const statuses = status.split(',');
    filtered = filtered.filter(p => {
      const ps = p.onlineStatus || [];
      return statuses.some(s => ps.includes(s));
    });
  }

  if (channel) {
    const channels = channel.split(',');
    filtered = filtered.filter(p => {
      const pc = p.channels || [];
      return channels.some(c => pc.includes(c));
    });
  }

  if (brand) {
    const brands = brand.split(',');
    filtered = filtered.filter(p => {
      const pb = p.brand || 'Jomoo 九牧';
      return brands.includes(pb);
    });
  }

  const total = filtered.length;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
  const start = (pageNum - 1) * limitNum;
  const paged = filtered.slice(start, start + limitNum);

  const result = {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
    products: paged.map(p => ({
      id: p.id,
      name: p.name,
      sapCode: p.sapCode,
      category: p.category,
      categoryVi: CATEGORY_VI[p.category]?.label || (p.category || '').split(' / ')[1] || '',
      categoryIcon: CATEGORY_VI[p.category]?.icon || '📦',
      cover: p.cover,
      shareUrl: p.shareUrl,
      onlineStatus: (p.onlineStatus || []).map(s => ({
        raw: s,
        label: STATUS_VI[s] || s,
        color: STATUS_COLOR[s] || '#9ca3af',
      })),
      channels: p.channels || [],
      brand: p.brand || '',
      source: p.source || 'jomoo',
      tag: p.tag || '',
    })),
  };

  // Store in LRU cache
  productsCache.set(req.query, result);

  res.json(result);
});

// GET /api/products/:id - product detail (1.5: dedup localProduct lookup)
app.get('/api/products/:id', async (req, res) => {
  const id = req.params.id;

  // Check cache
  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json(cached.data);
  }

  // Find product once (1.5: fixed duplication)
  const localProduct = products.find(p => String(p.id) === String(id));

  // ARROW products: return local specs directly (no external API needed)
  if (localProduct && localProduct.source === 'arrow-home.cn') {
    const allImages = [];
    if (localProduct.cover) allImages.push(localProduct.cover);
    for (const img of (localProduct.descImages || [])) {
      if (!allImages.includes(img)) allImages.push(img);
    }
    const result = {
      id: parseInt(id),
      name: localProduct.name || '',
      sapCode: localProduct.sapCode || '',
      category: localProduct.category || '',
      categoryVi: CATEGORY_VI[localProduct.category]?.label || (localProduct.category || '').split(' / ')[1] || '',
      shareUrl: localProduct.shareUrl || '',
      brand: localProduct.brand || 'ARROW 箭牌',
      source: 'arrow-home.cn',
      cover: localProduct.cover || '',
      images: allImages,
      specs: localProduct.specs || {},
      descText: localProduct.descText || '',
      tag: localProduct.tag || '',
      configure: '',
      spec: localProduct.descText || '',
      jmbarcode: '',
      displayItem: '',
      attributes: Object.entries(localProduct.specs || {}).map(([name, value]) => ({
        group: '规格参数',
        items: [{ name, value }],
      })),
    };
    detailCache.set(id, { data: result, time: Date.now() });
    return res.json(result);
  }

  try {
    const [baseRes, detailRes] = await Promise.all([
      fetch('https://mobile.jomoo.com/mpm/api/v1/product/share/getProductInfoBase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }),
      fetch('https://mobile.jomoo.com/mpm/api/v1/product/share/getProductDetailInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }),
    ]);

    const baseData = await baseRes.json();
    const detailData = await detailRes.json();

    const result = {
      id: parseInt(id),
      name: localProduct?.name || baseData.detail?.productName || '',
      sapCode: localProduct?.sapCode || baseData.detail?.sapCode || '',
      category: localProduct?.category || '',
      categoryVi: CATEGORY_VI[localProduct?.category]?.label || (localProduct?.category || '').split(' / ')[1] || '',
      shareUrl: localProduct?.shareUrl || `https://mobile.jomoo.com/mpm/share/productShare/index.html#/pages/info?id=${id}`,
      cover: baseData.detail?.cover || localProduct?.cover || '',
      images: (baseData.detail?.mainImageList || []).map(img => img.path),
      configure: detailData.detail?.configure || '',
      spec: detailData.detail?.spec || '',
      jmbarcode: detailData.detail?.jmbarcode || '',
      displayItem: detailData.detail?.displayItem || '',
      attributes: (detailData.detail?.flsxs || []).map(group => ({
        group: group.attrGroupName,
        items: (group.flsxNameValuePair || []).map(item => ({
          name: item.flsxName,
          value: item.flsxValue,
        })),
      })),
    };

    detailCache.set(id, { data: result, time: Date.now() });
    res.json(result);
  } catch (err) {
    console.error(`Error fetching detail for id=${id}:`, err.message);
    if (localProduct) {
      const fallback = {
        id: parseInt(id),
        name: localProduct.name || '',
        sapCode: localProduct.sapCode || '',
        category: localProduct.category || '',
        categoryVi: CATEGORY_VI[localProduct.category]?.label || (localProduct.category || '').split(' / ')[1] || '',
        shareUrl: localProduct.shareUrl || '',
        cover: localProduct.cover || '',
        images: localProduct.cover ? [localProduct.cover] : [],
        configure: '',
        spec: '',
        jmbarcode: '',
        displayItem: '',
        attributes: [],
        _fallback: true,
      };
      detailCache.set(id, { data: fallback, time: Date.now() });
      return res.json(fallback);
    }
    res.status(500).json({ error: 'Failed to fetch product detail', message: err.message });
  }
});

// GET /api/ask - AI natural language search
app.get('/api/ask', (req, res) => {
  const { q, status, limit = 20 } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Missing query parameter "q"' });
  }

  try {
    const result = searchProducts(q.trim(), {
      limit: Math.min(50, Math.max(1, parseInt(limit))),
      status: status || undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('AI search error:', err.message);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

// GET /api/keywords - list all available AI search keywords
app.get('/api/keywords', (req, res) => {
  const { KEYWORD_MAP } = require('./ai-search');

  const groups = {
    productType: { label: 'Loại sản phẩm', icon: '📦', keywords: [] },
    feature: { label: 'Tính năng', icon: '⚡', keywords: [] },
    color: { label: 'Màu sắc', icon: '🎨', keywords: [] },
    material: { label: 'Chất liệu', icon: '🧱', keywords: [] },
    shape: { label: 'Hình dạng', icon: '📐', keywords: [] },
    status: { label: 'Trạng thái', icon: '📊', keywords: [] },
  };

  for (const [keyword, mapping] of Object.entries(KEYWORD_MAP)) {
    const kw = keyword.trim();
    if (!kw || kw.length < 2) continue;

    let group = 'feature';
    const hasCategory = !!(mapping.category && mapping.category.length);
    const hasAttr = !!(mapping.attrKeywords && mapping.attrKeywords.length);
    const hasStatus = !!mapping.status;
    const hasName = !!(mapping.nameKeywords && mapping.nameKeywords.length);

    if (hasStatus) {
      group = 'status';
      if (!kw.cn) {
        mapping._displayCn = (mapping.status || []).map(s => {
          const map = { '在市': '在市(đang bán)', '已下市': '已下市(ngưng bán)', '已停产': '已停产(ngưng sx)', '临时上市': '临时上市(tạm thời)', '内部在市': '内部在市(nội bộ)', '项目定制': '项目定制(dự án)' };
          return map[s] || s;
        }).join(', ');
      }
    } else if (hasAttr) {
      const attrStr = mapping.attrKeywords.join(' ');
      if (/色|黑|白|金|银|铬|灰|铜|粉|蓝|绿|chrome|gold|black/.test(attrStr + ' ' + kw)) group = 'color';
      else if (/钢|不锈|铜|铝|ABS|PVC|陶瓷|玻璃|硅胶|实木|塑料/.test(attrStr)) group = 'material';
      else if (/方形|圆形|长方|椭圆|弧形|钻石|扇形/.test(attrStr)) group = 'shape';
      else if (hasCategory) group = 'productType';
    } else if (hasCategory) {
      group = 'productType';
    }

    const cnParts = [...new Set([...(mapping.nameKeywords || []), ...(mapping.attrKeywords || [])])];
    const cnDisplay = cnParts.length ? cnParts.join(', ') : (mapping._displayCn || (mapping.status || []).join(', '));

    groups[group].keywords.push({
      vi: kw,
      cn: cnDisplay,
      boost: mapping.boost || 1,
    });
  }

  for (const g of Object.values(groups)) {
    g.keywords.sort((a, b) => b.boost - a.boost);
  }

  res.json(groups);
});

// GET /api/compare - compare products (Sprint 3.1)
app.get('/api/compare', (req, res) => {
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'Missing ids parameter' });

  const idList = ids.split(',').slice(0, 3).map(s => s.trim());
  if (idList.length === 0) return res.status(400).json({ error: 'No valid IDs provided' });

  const results = idList.map(id => {
    const localProduct = products.find(p => String(p.id) === String(id));
    if (!localProduct) return { id, error: 'Product not found' };

    return {
      id: localProduct.id,
      name: localProduct.name || '',
      sapCode: localProduct.sapCode || '',
      category: localProduct.category || '',
      categoryVi: CATEGORY_VI[localProduct.category]?.label || (localProduct.category || '').split(' / ')[1] || '',
      categoryIcon: CATEGORY_VI[localProduct.category]?.icon || '📦',
      cover: localProduct.cover || '',
      shareUrl: localProduct.shareUrl || '',
      brand: localProduct.brand || '',
      source: localProduct.source || 'jomoo',
      tag: localProduct.tag || '',
      onlineStatus: (localProduct.onlineStatus || []).map(s => ({
        raw: s,
        label: STATUS_VI[s] || s,
        color: STATUS_COLOR[s] || '#9ca3af',
      })),
      channels: localProduct.channels || [],
      specs: localProduct.specs || {},
      descText: localProduct.descText || '',
    };
  });

  res.json({ count: results.length, products: results });
});

// GET /api/export - CSV export (Sprint 2.3)
app.get('/api/export', (req, res) => {
  const { q, category, status, channel, brand } = req.query;
  let filtered = products;

  if (q) {
    const lower = q.toLowerCase();
    filtered = filtered.filter(p =>
      (p.name || '').toLowerCase().includes(lower) ||
      (p.sapCode || '').toLowerCase().includes(lower)
    );
  }
  if (category) {
    const cats = category.split(',');
    filtered = filtered.filter(p => cats.includes(p.category));
  }
  if (status) {
    const statuses = status.split(',');
    filtered = filtered.filter(p => {
      const ps = p.onlineStatus || [];
      return statuses.some(s => ps.includes(s));
    });
  }
  if (channel) {
    const channels = channel.split(',');
    filtered = filtered.filter(p => {
      const pc = p.channels || [];
      return channels.some(c => pc.includes(c));
    });
  }
  if (brand) {
    const brands = brand.split(',');
    filtered = filtered.filter(p => {
      const pb = p.brand || 'Jomoo 九牧';
      return brands.includes(pb);
    });
  }

  const BOM = '\uFEFF';
  const header = 'id,name,sapCode,category,categoryVi,status,brand,channels,shareUrl\n';
  const rows = filtered.map(p => {
    const catVi = CATEGORY_VI[p.category]?.label || (p.category || '').split(' / ')[1] || '';
    const statusLabels = (p.onlineStatus || []).map(s => STATUS_VI[s] || s).join('; ');
    const channels = (p.channels || []).join('; ');
    const escape = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    return [
      p.id,
      escape(p.name),
      escape(p.sapCode),
      escape(p.category),
      escape(catVi),
      escape(statusLabels),
      escape(p.brand || ''),
      escape(channels),
      escape(p.shareUrl || ''),
    ].join(',');
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="jomoo-products.csv"');
  res.send(BOM + header + rows);
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    totalProducts: products.length,
    cacheSize: detailCache.size,
    productsCacheSize: productsCache.size,
    uptime: process.uptime(),
  });
});

// ============================================================
// GRACEFUL SHUTDOWN (Sprint 2.5)
// ============================================================
let server;

function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  detailCache.clear();
  productsCache.clear();
  if (server) {
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
    // Force exit after 5s
    setTimeout(() => {
      console.log('Forced shutdown after timeout.');
      process.exit(1);
    }, 5000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Jomoo Dashboard running at http://0.0.0.0:${PORT}`);
  console.log(`Access from LAN: http://<your-ip>:${PORT}`);
});

module.exports = { app, productsCache, detailCache, products, categoryCounts, brandCounts, gracefulShutdown };
