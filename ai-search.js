/**
 * AI Search Module - Vietnamese Natural Language → Product Filter
 * 
 * Enhanced: multi-signal scoring (category + name + attributes + fuse.js fuzzy),
 * pagination support, better accuracy.
 */

// ============================================================
// VIETNAMESE → CHINESE KEYWORD MAPPING
// ============================================================

const KEYWORD_MAP = {
  // === PRODUCT TYPES ===
  'arrow': { nameKeywords: ['箭牌'], boost: 2 },
  'phòng tắm đứng': { category: ['Shower Room / Phòng tắm đứng'], nameKeywords: ['淋浴房'], boost: 3 },
  'phòng tắm tùy chỉnh': { category: ['Custom Bathroom / Phòng tắm tùy chỉnh'], nameKeywords: ['定制卫浴'], boost: 3 },
  'đèn sưởi': { category: ['Bath Heater / Đèn sưởi'], nameKeywords: ['浴霸', '暖风机'], boost: 3 },
  'bồn cầu thông minh': { category: ['Smart Toilet / Bồn cầu thông minh'], nameKeywords: ['智能坐便器'], boost: 3 },
  'sen cây': { category: ['Shower / Sen tắm'], nameKeywords: ['花洒', '淋浴'], boost: 3 },
  'sen tắm': { category: ['Shower / Sen tắm'], nameKeywords: ['淋浴', '花洒'], boost: 3 },
  'sen': { category: ['Shower / Sen tắm'], nameKeywords: ['淋浴'], boost: 2 },
  'sen trần': { category: ['Overhead / Sen trần'], nameKeywords: ['顶喷', '花洒'], boost: 3 },
  'sen cầm tay': { category: ['Handheld / Cầm tay'], nameKeywords: ['手持', '花洒'], boost: 3 },
  'ổn định nhiệt': { category: ['Thermostatic / Ổn định nhiệt'], nameKeywords: ['恒温'], boost: 3 },
  'ổn nhiệt': { category: ['Thermostatic / Ổn định nhiệt'], nameKeywords: ['恒温'], boost: 3 },
  '恒温': { category: ['Thermostatic / Ổn định nhiệt'], nameKeywords: ['恒温'], boost: 3 },
  'vòi': { category: ['Faucet / Vòi'], nameKeywords: ['龙头'], boost: 2 },
  'vòi nước': { category: ['Faucet / Vòi'], nameKeywords: ['龙头'], boost: 3 },
  'vòi rửa': { category: ['Faucet / Vòi'], nameKeywords: ['龙头', '面盆'], boost: 3 },
  'vòi bếp': { category: ['Kitchen / Nhà bếp', 'Faucet / Vòi'], nameKeywords: ['厨房龙头'], boost: 3 },
  'vòi lavabo': { category: ['Faucet / Vòi'], nameKeywords: ['面盆龙头'], boost: 3 },
  'bồn cầu': { category: ['Toilet / Bồn cầu'], nameKeywords: ['马桶', '坐便器'], boost: 3 },
  'bồn tắm': { category: ['Bathtub / Bồn tắm'], nameKeywords: ['浴缸'], boost: 3 },
  'chậu rửa': { category: ['Basin / Chậu rửa mặt', 'Wash Basin / Chậu rửa mặt'], nameKeywords: ['面盆', '洗面'], boost: 3 },
  'lavabo': { category: ['Basin / Chậu rửa mặt', 'Art Basin / Chậu nghệ thuật'], nameKeywords: ['面盆', '艺术盆'], boost: 3 },
  'gương': { category: ['Mirror Cabinet / Tủ gương'], nameKeywords: ['镜', '化妆镜'], boost: 2 },
  'tủ gương': { category: ['Mirror Cabinet / Tủ gương'], nameKeywords: ['镜柜'], boost: 3 },
  'tủ浴室': { category: ['Bathroom Cabinet / Tủ phòng tắm'], nameKeywords: ['浴室柜'], boost: 3 },
  'tủ phòng tắm': { category: ['Bathroom Cabinet / Tủ phòng tắm'], nameKeywords: ['浴室柜'], boost: 3 },
  'vòi xịt': { category: ['Bidet / Vòi xịt'], nameKeywords: ['喷枪', '妇洗器'], boost: 3 },
  'giá để đồ': { category: ['Shelf / Giá để đồ'], nameKeywords: ['置物架', '挂件'], boost: 3 },
  'khăn tắm': { category: ['Towel Rack / Khăn tắm'], nameKeywords: ['浴巾架', '毛巾架'], boost: 3 },
  'ống mềm': { category: ['Hose / Ống mềm'], nameKeywords: ['软管'], boost: 3 },
  'máy nước nóng': { category: ['Water Heater / Máy nước nóng'], nameKeywords: ['热水器'], boost: 3 },
  'máy lọc nước': { category: ['Water Purifier / Máy lọc nước'], nameKeywords: ['净水器'], boost: 3 },
  'thông minh': { category: ['Smart / Thông minh'], nameKeywords: ['智能'], boost: 2 },
  'bồn rửa': { category: ['Sink / Bồn rửa'], nameKeywords: ['水槽'], boost: 2 },
  'rửa bát': { category: ['Sink / Bồn rửa', 'Kitchen / Nhà bếp'], nameKeywords: ['水槽', '厨房'], boost: 3 },
  'cống sàn': { category: ['Floor Drain / Cống sàn'], nameKeywords: ['地漏'], boost: 3 },
  'thoát nước': { category: ['Drain / Thoát nước'], nameKeywords: ['下水', '排水'], boost: 2 },
  'van góc': { category: ['Angle Valve / Van góc'], nameKeywords: ['角阀'], boost: 3 },
  'tiểu nam': { category: ['Urinal / Tiểu nam'], nameKeywords: ['小便器'], boost: 3 },
  'phụ kiện': { category: ['Accessory / Phụ kiện'], nameKeywords: ['挂件', '配件'], boost: 2 },
  'quạt thông gió': { category: ['Ventilation / Thông gió'], nameKeywords: ['排气扇', '换气扇'], boost: 3 },

  // === FEATURES ===
  'phím đàn': { nameKeywords: ['钢琴'], attrKeywords: ['钢琴'], boost: 2 },
  'piano': { nameKeywords: ['钢琴'], attrKeywords: ['钢琴'], boost: 2 },
  'tăng áp': { nameKeywords: ['增压', '空气增压'], attrKeywords: ['增压'], boost: 2 },
  'chống cặn': { nameKeywords: ['除垢', '防垢'], attrKeywords: ['除垢'], boost: 2 },
  'khử cặn': { nameKeywords: ['除垢'], attrKeywords: ['除垢'], boost: 2 },
  'air energy': { nameKeywords: ['空气能'], attrKeywords: ['空气能'], boost: 2 },
  'không khí': { nameKeywords: ['空气能', '空气增压'], boost: 1 },
  'một nút': { nameKeywords: ['一键'], attrKeywords: ['一键'], boost: 1 },
  'một nút bấm': { nameKeywords: ['一键启动'], attrKeywords: ['一键启动'], boost: 2 },
  'xoáy nước': { nameKeywords: ['旋舞水'], attrKeywords: ['旋舞水'], boost: 2 },
  'âm tường': { nameKeywords: ['暗装', '入墙'], attrKeywords: ['暗装', '入墙'], boost: 2 },
  'nổi': { nameKeywords: ['明装'], attrKeywords: ['明装'], boost: 1 },
  'rút kéo': { nameKeywords: ['抽拉'], attrKeywords: ['抽拉'], boost: 2 },
  'kéo dài': { nameKeywords: ['抽拉', '伸缩'], attrKeywords: ['伸缩'], boost: 1 },
  'xoay': { nameKeywords: ['旋转'], attrKeywords: ['旋转'], boost: 1 },
  'cảm ứng': { nameKeywords: ['感应'], attrKeywords: ['感应'], boost: 2 },
  'tự động': { nameKeywords: ['自动', '感应'], attrKeywords: ['自动'], boost: 2 },
  'massage': { nameKeywords: ['按摩'], attrKeywords: ['按摩'], boost: 2 },
  'xông hơi': { nameKeywords: ['蒸汽', '桑拿'], attrKeywords: ['蒸汽'], boost: 2 },
  'chống khuẩn': { nameKeywords: ['抗菌', '杀菌'], attrKeywords: ['抗菌'], boost: 2 },
  'khử mùi': { nameKeywords: ['除臭', '防臭'], attrKeywords: ['除臭'], boost: 2 },
  'chống tràn': { nameKeywords: ['防溢'], attrKeywords: ['防溢'], boost: 1 },
  'tiết kiệm nước': { nameKeywords: ['节水'], attrKeywords: ['节水'], boost: 2 },
  'xả mạnh': { nameKeywords: ['冲力', '超漩'], attrKeywords: ['冲力'], boost: 1 },
  'đèn LED': { nameKeywords: ['LED', '灯'], attrKeywords: ['LED'], boost: 2 },
  'sấy khô': { nameKeywords: ['烘干'], attrKeywords: ['烘干'], boost: 2 },
  'sưởi ấm': { nameKeywords: ['加热', '暖风'], attrKeywords: ['加热'], boost: 2 },
  'nắp rơi êm': { nameKeywords: ['缓降', '静音'], attrKeywords: ['缓降'], boost: 2 },
  'hạ chậm': { nameKeywords: ['缓降'], attrKeywords: ['缓降'], boost: 1 },
  'chống bám bẩn': { nameKeywords: ['防污', '自洁'], attrKeywords: ['防污'], boost: 1 },
  'kháng khuẩn': { nameKeywords: ['抗菌'], attrKeywords: ['抗菌'], boost: 2 },
  'bọt khí': { nameKeywords: ['气泡', '空气注入'], attrKeywords: ['气泡'], boost: 1 },
  'lưới lọc': { nameKeywords: ['过滤', '滤网'], attrKeywords: ['过滤'], boost: 1 },
  'điều chỉnh độ cao': { nameKeywords: ['升降', '可调'], attrKeywords: ['升降'], boost: 2 },
  'nhiều chế độ': { nameKeywords: ['多功能', '多模式'], attrKeywords: ['多功能'], boost: 1 },
  'vòi sen kép': { nameKeywords: ['双花洒'], attrKeywords: ['双花洒'], boost: 2 },

  // === COLORS ===
  'vàng': { attrKeywords: ['金色', '黄铜', '金'], nameKeywords: ['金色'], boost: 2 },
  'gold': { attrKeywords: ['金色', '黄铜'], nameKeywords: ['金色'], boost: 2 },
  'đen': { attrKeywords: ['黑色', '哑光黑', '磨砂黑'], nameKeywords: ['黑色', '枪灰'], boost: 2 },
  'black': { attrKeywords: ['黑色', '哑光黑'], nameKeywords: ['黑色'], boost: 2 },
  'trắng': { attrKeywords: ['白色'], nameKeywords: ['白色'], boost: 2 },
  'chrome': { attrKeywords: ['镀铬', '亮铬'], nameKeywords: ['镀铬'], boost: 2 },
  'bạc': { attrKeywords: ['镀铬', '银色', '亮银'], nameKeywords: ['镀铬'], boost: 2 },
  'xám': { attrKeywords: ['灰色', '枪灰'], nameKeywords: ['枪灰'], boost: 2 },
  'xám đen': { attrKeywords: ['枪灰', '灰黑色'], nameKeywords: ['枪灰'], boost: 2 },
  'hồng': { attrKeywords: ['粉色'], nameKeywords: ['粉色'], boost: 1 },
  'xanh': { attrKeywords: ['蓝色', '绿色'], nameKeywords: ['蓝色', '绿色'], boost: 1 },
  'đồng': { attrKeywords: ['铜色', '古铜', '黄铜'], nameKeywords: ['铜'], boost: 2 },
  'mạ vàng': { attrKeywords: ['镀金', '金色'], nameKeywords: ['金色', '镀金'], boost: 2 },
  'mạ crom': { attrKeywords: ['电镀', '镀铬'], nameKeywords: ['镀铬'], boost: 2 },

  // === SHAPES ===
  'vuông': { attrKeywords: ['方形'], nameKeywords: ['方形'], boost: 2 },
  'tròn': { attrKeywords: ['圆形'], nameKeywords: ['圆形'], boost: 2 },
  'chữ nhật': { attrKeywords: ['长方形'], nameKeywords: ['长方形'], boost: 2 },
  'oval': { attrKeywords: ['椭圆形'], nameKeywords: ['椭圆'], boost: 1 },
  'cong': { attrKeywords: ['弧形', '曲面'], nameKeywords: ['弧形'], boost: 1 },
  'kim cương': { attrKeywords: ['钻石形'], nameKeywords: ['钻石形'], boost: 2 },
  'quạt': { attrKeywords: ['扇形'], nameKeywords: ['扇形'], boost: 2 },

  // === MATERIALS ===
  'inox': { attrKeywords: ['不锈钢'], nameKeywords: ['不锈钢'], boost: 2 },
  'thép không gỉ': { attrKeywords: ['不锈钢'], nameKeywords: ['不锈钢'], boost: 2 },
  'đồng thau': { attrKeywords: ['铜合金', '黄铜'], nameKeywords: ['铜'], boost: 2 },
  'nhựa': { attrKeywords: ['ABS', '塑料', 'PVC'], nameKeywords: ['ABS'], boost: 1 },
  'gỗ': { attrKeywords: ['实木', '多层实木'], nameKeywords: ['实木'], boost: 1 },
  'sứ': { attrKeywords: ['陶瓷'], nameKeywords: ['陶瓷'], boost: 1 },
  'kính': { attrKeywords: ['钢化玻璃', '玻璃'], nameKeywords: ['玻璃'], boost: 1 },
  'nhôm': { attrKeywords: ['铝合金', '铝'], nameKeywords: ['太空铝'], boost: 2 },
  'silicone': { attrKeywords: ['硅胶'], nameKeywords: ['硅胶'], boost: 1 },

  // === SIZES ===
  'nhỏ': { attrKeywords: ['小'], boost: 1 },
  'lớn': { attrKeywords: ['大'], boost: 1 },
  'vừa': { attrKeywords: ['中'], boost: 1 },

  // === STATUS ===
  'đang bán': { status: ['在市'], boost: 2 },
  'còn hàng': { status: ['在市'], boost: 2 },
  'hàng mới': { status: ['在市', '临时上市'], boost: 1 },
  'ngưng bán': { status: ['已下市'], boost: 1 },
  'hết hàng': { status: ['已下市', '已停产'], boost: 1 },
};

// ============================================================
// FUSE.JS FALLBACK INDEX
// ============================================================
let fuseIndex = null;

function initFuse(data) {
  try {
    const Fuse = require('fuse.js');
    fuseIndex = new Fuse(data, {
      keys: [
        { name: 'name', weight: 0.5 },
        { name: 'sapCode', weight: 0.3 },
        { name: 'category', weight: 0.2 },
      ],
      threshold: 0.4,
      includeScore: true,
      minMatchCharLength: 2,
    });
  } catch (e) {
    // fuse.js not installed, skip
    fuseIndex = null;
  }
}

// ============================================================
// QUERY PARSER
// ============================================================

function parseQuery(query) {
  const q = query.toLowerCase().trim();
  const matched = [];
  const categories = new Set();
  const nameKeywords = new Set();
  const attrKeywords = new Set();
  let status = null;
  let totalBoost = 0;

  const sortedKeys = Object.keys(KEYWORD_MAP).sort((a, b) => b.length - a.length);

  let remaining = q;
  for (const key of sortedKeys) {
    const lowerKey = key.toLowerCase();
    const idx = remaining.indexOf(lowerKey);
    if (idx !== -1) {
      const mapping = KEYWORD_MAP[key];
      matched.push(key);
      totalBoost += mapping.boost || 1;

      if (mapping.category) mapping.category.forEach(c => categories.add(c));
      if (mapping.nameKeywords) mapping.nameKeywords.forEach(k => nameKeywords.add(k));
      if (mapping.attrKeywords) mapping.attrKeywords.forEach(k => attrKeywords.add(k));
      if (mapping.status) status = mapping.status;

      remaining = remaining.slice(0, idx) + ' '.repeat(lowerKey.length) + remaining.slice(idx + lowerKey.length);
    }
  }

  // Chinese keywords directly
  const chineseTerms = q.match(/[\u4e00-\u9fff]+/g) || [];
  for (const term of chineseTerms) {
    if (term.length >= 2) nameKeywords.add(term);
  }

  const explanation = [];
  if (matched.length) explanation.push(`Từ khóa: ${matched.join(', ')}`);
  if (categories.size) explanation.push(`Danh mục: ${[...categories].map(c => c.split(' / ')[1] || c).join(', ')}`);
  if (nameKeywords.size) explanation.push(`Tên: ${[...nameKeywords].join(', ')}`);
  if (attrKeywords.size) explanation.push(`Thuộc tính: ${[...attrKeywords].join(', ')}`);
  if (status) explanation.push(`Trạng thái: ${status.join(', ')}`);

  return {
    categories: [...categories],
    nameKeywords: [...nameKeywords],
    attrKeywords: [...attrKeywords],
    status,
    confidence: Math.min(1, totalBoost / 5),
    matched,
    explanation: explanation.join(' | '),
  };
}

// ============================================================
// PRECOMPUTED ATTRIBUTE INDEX (for fast attr matching)
// ============================================================
let attrWordIndex = null; // Map<word, Set<productIndex>>

function buildAttrIndex(data) {
  attrWordIndex = new Map();
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    // Collect all searchable text from product
    const words = new Set();
    // Add name words
    if (p.name) {
      for (const w of p.name.split(/[\s,，、/()（）]+/)) {
        if (w.length >= 1) words.add(w.toLowerCase());
      }
    }
    // Add category
    if (p.category) words.add(p.category.toLowerCase());
    // Add sapCode
    if (p.sapCode) words.add(p.sapCode.toLowerCase());
    // Add brand
    if (p.brand) words.add(p.brand.toLowerCase());

    for (const w of words) {
      if (!attrWordIndex.has(w)) attrWordIndex.set(w, new Set());
      attrWordIndex.get(w).add(i);
    }
  }
}

// ============================================================
// PRODUCT SCORING (enhanced)
// ============================================================

function scoreProduct(product, parsed) {
  let score = 0;
  const name = (product.name || '').toLowerCase();
  const category = (product.category || '').toLowerCase();
  const sapCode = (product.sapCode || '').toLowerCase();

  // 1. Category match (+10)
  if (parsed.categories.length > 0) {
    if (parsed.categories.includes(product.category)) {
      score += 10;
    }
  }

  // 2. Name keyword match (+3 each, +2 bonus per extra match)
  let nameMatches = 0;
  for (const kw of parsed.nameKeywords) {
    if (name.includes(kw.toLowerCase())) {
      score += 3;
      nameMatches++;
    }
  }
  if (nameMatches >= 2) score += nameMatches * 2;

  // 3. Attribute keyword match (+2 each) — checks name, category, sapCode
  for (const kw of parsed.attrKeywords) {
    const lower = kw.toLowerCase();
    if (name.includes(lower) || category.includes(lower) || sapCode.includes(lower)) {
      score += 2;
    }
  }

  // 4. Direct query word match in name (for unmatched words) (+1 each)
  // This helps when the query has words not in KEYWORD_MAP
  const parsedWordSet = new Set([
    ...parsed.nameKeywords.map(k => k.toLowerCase()),
    ...parsed.attrKeywords.map(k => k.toLowerCase()),
    ...parsed.matched.map(k => k.toLowerCase()),
  ]);
  // Skip this for performance on large datasets — the keyword map covers most cases

  return score;
}

// ============================================================
// SEARCH PRODUCTS (with pagination + fuzzy fallback)
// ============================================================

function searchProducts(query, opts = {}) {
  const limit = opts.limit || 20;
  const page = Math.max(1, parseInt(opts.page) || 1);
  const parsed = parseQuery(query);

  // Filter by status
  let filtered = products;
  const statusFilter = opts.status || (parsed.status ? parsed.status.join(',') : null);
  if (statusFilter) {
    const statuses = statusFilter.split(',');
    filtered = filtered.filter(p => {
      const ps = p.onlineStatus || [];
      return statuses.some(s => ps.includes(s));
    });
  }

  // Score and rank
  const scored = [];
  for (const p of filtered) {
    const score = scoreProduct(p, parsed);
    if (score > 0) {
      scored.push({ product: p, score });
    }
  }

  // Sort by score desc, then by name length (shorter = more relevant)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.product.name || '').length - (b.product.name || '').length;
  });

  // Fuzzy fallback: if < 5 exact results and fuse.js available, supplement with fuzzy
  let finalScored = scored;
  if (scored.length < 5 && fuseIndex) {
    const fuseResults = fuseIndex.search(query, { limit: limit * 2 });
    const existingIds = new Set(scored.map(s => s.product.id));
    for (const r of fuseResults) {
      if (!existingIds.has(r.item.id)) {
        // Fuzzy matches get lower base score
        const fuzzyScore = Math.max(1, Math.round((1 - r.score) * 5));
        finalScored.push({ product: r.item, score: fuzzyScore, _fuzzy: true });
      }
    }
    // Re-sort
    finalScored.sort((a, b) => b.score - a.score);
  }

  const total = finalScored.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const paged = finalScored.slice(start, start + limit);

  return {
    query,
    page,
    limit,
    total,
    totalPages,
    parsed: {
      matched: parsed.matched,
      categories: parsed.categories,
      nameKeywords: parsed.nameKeywords,
      attrKeywords: parsed.attrKeywords,
      confidence: parsed.confidence,
      explanation: parsed.explanation,
    },
    products: paged.map(({ product: p, score, _fuzzy }) => ({
      id: p.id,
      name: p.name,
      sapCode: p.sapCode,
      category: p.category,
      categoryVi: CATEGORY_VI[p.category]?.label || (p.category || '').split(' / ')[1] || '',
      categoryIcon: CATEGORY_VI[p.category]?.icon || '📦',
      cover: p.cover,
      shareUrl: p.shareUrl,
      brand: p.brand || '',
      onlineStatus: (p.onlineStatus || []).map(s => ({
        raw: s,
        label: STATUS_VI[s] || s,
        color: STATUS_COLOR[s] || '#9ca3af',
      })),
      score,
      _fuzzy: _fuzzy || false,
    })),
  };
}

// These will be set by server.js via init()
let products = [];
let CATEGORY_VI = {};
let STATUS_VI = {};
let STATUS_COLOR = {};

function init(data, catVi, statusVi, statusColor) {
  products = data;
  CATEGORY_VI = catVi;
  STATUS_VI = statusVi;
  STATUS_COLOR = statusColor;
  // Build indexes
  buildAttrIndex(data);
  initFuse(data);
}

module.exports = { parseQuery, searchProducts, scoreProduct, KEYWORD_MAP, init };
