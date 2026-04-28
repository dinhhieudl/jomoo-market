const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8765;

// Load products data
let products = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8');
  products = JSON.parse(raw);
  console.log(`Loaded ${products.length} products`);
} catch (e) {
  console.error('Failed to load products.json:', e.message);
}

// In-memory cache for product details
const detailCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// Vietnamese category mapping
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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/categories - list all categories with counts
app.get('/api/categories', (req, res) => {
  const counts = {};
  for (const p of products) {
    const cat = p.category || 'Other / Khác';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const cats = Object.entries(counts)
    .map(([name, count]) => ({
      name,
      nameVi: CATEGORY_VI[name]?.label || name.split(' / ')[1] || name,
      icon: CATEGORY_VI[name]?.icon || '📦',
      count,
    }))
    .sort((a, b) => b.count - a.count);
  res.json(cats);
});

// GET /api/products - list/filter products
app.get('/api/products', (req, res) => {
  const { q, category, status, channel, page = 1, limit = 50 } = req.query;
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

  const total = filtered.length;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
  const start = (pageNum - 1) * limitNum;
  const paged = filtered.slice(start, start + limitNum);

  res.json({
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
    })),
  });
});

// GET /api/products/:id - product detail (proxied from Jomoo API)
app.get('/api/products/:id', async (req, res) => {
  const id = req.params.id;

  // Check cache
  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json(cached.data);
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

    // Find product in local data
    const localProduct = products.find(p => String(p.id) === String(id));

    const result = {
      id: parseInt(id),
      // Basic from local
      name: localProduct?.name || baseData.detail?.productName || '',
      sapCode: localProduct?.sapCode || baseData.detail?.sapCode || '',
      category: localProduct?.category || '',
      categoryVi: CATEGORY_VI[localProduct?.category]?.label || (localProduct?.category || '').split(' / ')[1] || '',
      shareUrl: localProduct?.shareUrl || `https://mobile.jomoo.com/mpm/share/productShare/index.html#/pages/info?id=${id}`,
      // Images from API
      cover: baseData.detail?.cover || localProduct?.cover || '',
      images: (baseData.detail?.mainImageList || []).map(img => img.path),
      // Specs from detail API
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

    // Cache it
    detailCache.set(id, { data: result, time: Date.now() });

    res.json(result);
  } catch (err) {
    console.error(`Error fetching detail for id=${id}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch product detail', message: err.message });
  }
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    totalProducts: products.length,
    cacheSize: detailCache.size,
    uptime: process.uptime(),
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Jomoo Dashboard running at http://0.0.0.0:${PORT}`);
  console.log(`Access from LAN: http://<your-ip>:${PORT}`);
});
