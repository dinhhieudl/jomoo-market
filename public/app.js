const API = '';

// Proxy Arrow images through backend (CDN blocks direct access)
function proxyImg(url) {
  if (!url) return '';
  if (url.includes('res-static.arrow-home.cn') || url.includes('arrow-home.cn')) {
    return `${API}/api/img-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

let state = {
  categories: [],
  brands: [],
  selectedBrands: [],
  selectedCats: [],
  selectedStatuses: [],
  searchQuery: '',
  searchMode: 'filter', // 'filter' or 'ai'
  page: 1,
  limit: 50,
  total: 0,
  products: [],
  loading: false,
  aiResult: null,
  showFavoritesOnly: false,
};

// Status options
const STATUSES = [
  { raw: '在市', label: 'Đang bán', color: '#10b981' },
  { raw: '已下市', label: 'Ngưng bán', color: '#9ca3af' },
  { raw: '已停产', label: 'Ngưng sản xuất', color: '#ef4444' },
  { raw: '内部在市', label: 'Nội bộ', color: '#f59e0b' },
  { raw: '项目定制', label: 'Dự án riêng', color: '#8b5cf6' },
];

// ============================================================
// FAVORITES (localStorage)
// ============================================================
const FAV_KEY = 'jomoo_favorites';

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY)) || [];
  } catch { return []; }
}

function saveFavorites(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

function isFavorite(id) {
  return getFavorites().includes(id);
}

function toggleFavorite(id) {
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(id);
  saveFavorites(favs);
  // Update UI
  document.querySelectorAll(`.card-fav[data-id="${id}"]`).forEach(el => {
    el.classList.toggle('active', idx < 0);
    el.textContent = idx < 0 ? '❤️' : '🤍';
  });
  updateFavCount();
}

function updateFavCount() {
  const el = document.getElementById('favCount');
  if (el) el.textContent = `${getFavorites().length} yêu thích`;
}

function toggleShowFavorites() {
  state.showFavoritesOnly = !state.showFavoritesOnly;
  const btn = document.getElementById('favToggle');
  if (btn) btn.classList.toggle('active', state.showFavoritesOnly);
  state.page = 1;
  loadProducts();
}

// Initialize
async function init() {
  await Promise.all([loadCategories(), loadBrands()]);
  renderStatusButtons();
  await loadProducts();

  // Search with debounce
  let debounce;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      state.page = 1;
      if (state.searchMode === 'ai' && state.searchQuery) {
        loadAISearch();
      } else {
        loadProducts();
      }
    }, state.searchMode === 'ai' ? 500 : 350);
  });

  // Enter key triggers AI search immediately
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.searchMode === 'ai') {
      clearTimeout(debounce);
      state.searchQuery = e.target.value.trim();
      if (state.searchQuery) loadAISearch();
    }
  });

  // Close overlay on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });

  // Load keywords
  loadKeywords();
  updateFavCount();
}

async function loadCategories() {
  try {
    const res = await fetch(`${API}/api/categories`);
    state.categories = await res.json();
    renderCategories();
  } catch (e) {
    console.error('Failed to load categories:', e);
  }
}

const BRAND_ICONS = {
  'Jomoo 九牧': '🟢',
  'ARROW 箭牌': '🔴',
};

async function loadBrands() {
  try {
    const res = await fetch(`${API}/api/brands`);
    state.brands = await res.json();
    renderBrands();
  } catch (e) {
    console.error('Failed to load brands:', e);
  }
}

function renderBrands() {
  const container = document.getElementById('brandList');
  container.innerHTML = state.brands.map(b => `
    <li class="brand-item" data-brand="${b.name}" onclick="toggleBrand('${b.name}')">
      <span class="icon">${BRAND_ICONS[b.name] || '🏷️'}</span>
      <span class="label">${b.name}</span>
      <span class="count">${b.count.toLocaleString()}</span>
    </li>
  `).join('');
}

function toggleBrand(brand) {
  const idx = state.selectedBrands.indexOf(brand);
  if (idx >= 0) state.selectedBrands.splice(idx, 1);
  else state.selectedBrands.push(brand);
  state.page = 1;
  updateBrandUI();
  loadProducts();
}

function updateBrandUI() {
  document.querySelectorAll('.brand-item').forEach(el => {
    el.classList.toggle('active', state.selectedBrands.includes(el.dataset.brand));
  });
}

function renderStatusButtons() {
  const container = document.getElementById('statusGroup');
  container.innerHTML = STATUSES.map(s => `
    <button class="status-btn" data-status="${s.raw}" onclick="toggleStatus('${s.raw}')"
      style="--sc: ${s.color}">
      ${s.label}
    </button>
  `).join('');
}

function renderCategories() {
  const container = document.getElementById('catList');
  container.innerHTML = state.categories.map(c => `
    <li class="cat-item" data-cat="${c.name}" onclick="toggleCategory('${c.name}')">
      <span class="icon">${c.icon}</span>
      <span class="label">${c.nameVi}</span>
      <span class="count">${c.count}</span>
    </li>
  `).join('');
}

function toggleCategory(cat) {
  const idx = state.selectedCats.indexOf(cat);
  if (idx >= 0) state.selectedCats.splice(idx, 1);
  else state.selectedCats.push(cat);
  state.page = 1;
  updateCatUI();
  loadProducts();
}

function toggleStatus(status) {
  const idx = state.selectedStatuses.indexOf(status);
  if (idx >= 0) state.selectedStatuses.splice(idx, 1);
  else state.selectedStatuses.push(status);
  state.page = 1;
  updateStatusUI();
  loadProducts();
}

function updateCatUI() {
  document.querySelectorAll('.cat-item').forEach(el => {
    el.classList.toggle('active', state.selectedCats.includes(el.dataset.cat));
  });
}

function updateStatusUI() {
  document.querySelectorAll('.status-btn').forEach(el => {
    el.classList.toggle('active', state.selectedStatuses.includes(el.dataset.status));
  });
}

async function loadProducts() {
  if (state.loading) return;
  state.loading = true;

  const params = new URLSearchParams({ page: state.page, limit: state.limit });
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (state.selectedCats.length) params.set('category', state.selectedCats.join(','));
  if (state.selectedStatuses.length) params.set('status', state.selectedStatuses.join(','));
  if (state.selectedBrands.length) params.set('brand', state.selectedBrands.join(','));

  try {
    const res = await fetch(`${API}/api/products?${params}`);
    const data = await res.json();

    // Filter by favorites if needed
    if (state.showFavoritesOnly) {
      const favs = new Set(getFavorites());
      data.products = data.products.filter(p => favs.has(p.id));
      data.total = data.products.length;
    }

    state.products = data.products;
    state.total = data.total;
    renderProducts(data);
    document.getElementById('stats').textContent = `${data.total.toLocaleString()} sản phẩm`;
  } catch (e) {
    console.error('Failed to load products:', e);
    document.getElementById('mainContent').innerHTML = '<div class="empty"><div class="icon">❌</div><p>Lỗi tải dữ liệu</p></div>';
  }
  state.loading = false;
}

function renderProducts(data) {
  const main = document.getElementById('mainContent');

  if (data.total === 0) {
    main.innerHTML = '<div class="empty"><div class="icon">🔍</div><p>Không tìm thấy sản phẩm nào</p></div>';
    return;
  }

  const favs = new Set(getFavorites());
  const cards = data.products.map(p => {
    const status = p.onlineStatus[0] || {};
    const imgSrc = proxyImg(p.cover);
    const imgHtml = imgSrc
      ? `<img class="card-img" src="${imgSrc}" alt="${p.name}" loading="lazy" onerror="this.outerHTML='<div class=\\'card-img placeholder\\'>📦</div>'">`
      : '<div class="card-img placeholder">📦</div>';
    const isFav = favs.has(p.id);
    return `
      <div class="product-card">
        <button class="card-fav ${isFav ? 'active' : ''}" data-id="${p.id}" onclick="event.stopPropagation();toggleFavorite(${p.id})">${isFav ? '❤️' : '🤍'}</button>
        <div onclick="showDetail(${p.id})">
          ${imgHtml}
          <div class="card-body">
            <div class="card-name">${p.name}</div>
            <div class="card-meta">
              <span class="card-sap">${p.sapCode}</span>
              ${status.label ? `<span class="card-status" style="background:${status.color}22;color:${status.color}">${status.label}</span>` : ''}
            </div>
            <div class="card-cat">${p.categoryIcon} ${p.categoryVi} ${p.brand ? `<span class="card-brand ${p.brand.includes('ARROW') ? 'arrow' : 'jomoo'}">${p.brand}</span>` : ''}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Pagination
  const totalPages = data.totalPages;
  let paginationHtml = '';
  if (totalPages > 1) {
    paginationHtml = `
      <div class="pagination">
        <button class="page-btn" onclick="goPage(${data.page - 1})" ${data.page <= 1 ? 'disabled' : ''}>‹ Trước</button>
        <span class="page-info">Trang ${data.page} / ${totalPages}</span>
        <button class="page-btn" onclick="goPage(${data.page + 1})" ${data.page >= totalPages ? 'disabled' : ''}>Sau ›</button>
      </div>
    `;
  }

  main.innerHTML = `<div class="product-grid">${cards}</div>${paginationHtml}`;
}

function goPage(page) {
  state.page = page;
  if (state.searchMode === 'ai') loadAISearch();
  else loadProducts();
  document.getElementById('mainContent').scrollTop = 0;
}

function setSearchMode(mode) {
  state.searchMode = mode;
  state.aiResult = null;
  document.getElementById('modeFilter').classList.toggle('active', mode === 'filter');
  document.getElementById('modeAI').classList.toggle('active', mode === 'ai');
  const input = document.getElementById('searchInput');
  input.placeholder = mode === 'ai'
    ? '🤖 Hỏi tự nhiên: "sen cây ổn định nhiệt phím đàn"...'
    : 'Tìm theo tên hoặc mã SAP...';

  if (mode === 'filter') {
    state.page = 1;
    loadProducts();
  } else if (state.searchQuery) {
    loadAISearch();
  }
}

async function loadAISearch() {
  if (state.loading) return;
  if (!state.searchQuery) return;
  state.loading = true;

  const params = new URLSearchParams({
    q: state.searchQuery,
    page: state.page,
    limit: state.limit,
  });
  if (state.selectedStatuses.length) params.set('status', state.selectedStatuses.join(','));

  try {
    const res = await fetch(`${API}/api/ask?${params}`);
    const data = await res.json();
    state.aiResult = data;
    state.products = data.products;
    state.total = data.total;
    renderAIResults(data);
    document.getElementById('stats').textContent = `🤖 ${data.total.toLocaleString()} kết quả`;
  } catch (e) {
    console.error('AI search failed:', e);
    document.getElementById('mainContent').innerHTML = '<div class="empty"><div class="icon">❌</div><p>Lỗi tìm kiếm AI</p></div>';
  }
  state.loading = false;
}

function renderAIResults(data) {
  const main = document.getElementById('mainContent');

  // AI explanation banner
  const parsed = data.parsed || {};
  const confidence = Math.round((parsed.confidence || 0) * 100);
  const bannerHtml = `
    <div class="ai-banner">
      <div class="ai-title"><span class="ai-icon">🤖</span> Kết quả tìm kiếm AI</div>
      <div class="ai-meta">
        <span>📊 ${data.total} sản phẩm phù hợp</span>
        <span>🎯 Độ tin cậy: ${confidence}%</span>
        ${parsed.matched?.length ? `<span>🔤 ${parsed.matched.join(', ')}</span>` : ''}
      </div>
      ${parsed.explanation ? `<div class="ai-explanation">${parsed.explanation}</div>` : ''}
      <div class="ai-suggestions">
        <span style="color:#94a3b8;font-size:11px;">Thử:</span>
        <button onclick="tryAIQuery('sen cây ổn định nhiệt')">🚿 Sen cây ổn nhiệt</button>
        <button onclick="tryAIQuery('vòi rửa bát rút kéo')">🚰 Vòi rửa bát rút kéo</button>
        <button onclick="tryAIQuery('bồn cầu thông minh')">🚽 Bồn cầu thông minh</button>
        <button onclick="tryAIQuery('sen tắm tăng áp chống cặn')">🚿 Sen tăng áp chống cặn</button>
        <button onclick="tryAIQuery('gương đèn LED')">🪞 Gương đèn LED</button>
        <button onclick="tryAIQuery('phụ kiện phòng tắm màu đen')">🖤 Phụ kiện đen</button>
      </div>
    </div>
  `;

  if (data.total === 0) {
    main.innerHTML = `
      ${bannerHtml}
      <div class="empty">
        <div class="icon">🔍</div>
        <p>Không tìm thấy sản phẩm phù hợp</p>
        <p style="font-size:13px;margin-top:8px;color:var(--text2);">Thử mô tả khác hoặc dùng bộ lọc bên trái</p>
      </div>
    `;
    return;
  }

  const favs = new Set(getFavorites());
  const cards = data.products.map(p => {
    const status = p.onlineStatus[0] || {};
    const imgSrc = proxyImg(p.cover);
    const imgHtml = imgSrc
      ? `<img class="card-img" src="${imgSrc}" alt="${p.name}" loading="lazy" onerror="this.outerHTML='<div class=\\'card-img placeholder\\'>📦</div>'">`
      : '<div class="card-img placeholder">📦</div>';
    const isFav = favs.has(p.id);
    return `
      <div class="product-card">
        <button class="card-fav ${isFav ? 'active' : ''}" data-id="${p.id}" onclick="event.stopPropagation();toggleFavorite(${p.id})">${isFav ? '❤️' : '🤍'}</button>
        <div onclick="showDetail(${p.id})">
          ${imgHtml}
          <div class="card-body">
            <div class="card-name">${p.name}</div>
            <div class="card-meta">
              <span class="card-sap">${p.sapCode}</span>
              ${status.label ? `<span class="card-status" style="background:${status.color}22;color:${status.color}">${status.label}</span>` : ''}
            </div>
            <div class="card-cat">${p.categoryIcon} ${p.categoryVi} ${p.brand ? `<span class="card-brand ${p.brand.includes('ARROW') ? 'arrow' : 'jomoo'}">${p.brand}</span>` : ''}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Pagination
  let paginationHtml = '';
  if (data.totalPages > 1) {
    const startItem = ((data.page || 1) - 1) * (data.limit || 50) + 1;
    const endItem = Math.min((data.page || 1) * (data.limit || 50), data.total);
    paginationHtml = `
      <div class="pagination">
        <button class="page-btn" onclick="goPage(${(data.page || 1) - 1})" ${(data.page || 1) <= 1 ? 'disabled' : ''}>‹ Trước</button>
        <span class="page-info">Hiển thị ${startItem}-${endItem} / ${data.total.toLocaleString()} sản phẩm — Trang ${data.page || 1} / ${data.totalPages}</span>
        <button class="page-btn" onclick="goPage(${(data.page || 1) + 1})" ${(data.page || 1) >= data.totalPages ? 'disabled' : ''}>Sau ›</button>
      </div>
    `;
  }

  main.innerHTML = `${bannerHtml}<div class="product-grid">${cards}</div>${paginationHtml}`;
}

function tryAIQuery(query) {
  document.getElementById('searchInput').value = query;
  state.searchQuery = query;
  setSearchMode('ai');
  loadAISearch();
}

function toggleKWPanel() {
  const panel = document.getElementById('kwPanel');
  const arrow = document.getElementById('kwArrow');
  const isOpen = panel.classList.contains('expanded');
  panel.classList.toggle('collapsed', isOpen);
  panel.classList.toggle('expanded', !isOpen);
  arrow.classList.toggle('open', !isOpen);
}

async function loadKeywords() {
  try {
    const res = await fetch(`${API}/api/keywords`);
    const groups = await res.json();
    renderKeywords(groups);
  } catch (e) {
    console.error('Failed to load keywords:', e);
    document.getElementById('kwContent').innerHTML = '<span style="color:var(--text2)">Không tải được từ khóa</span>';
  }
}

function renderKeywords(groups) {
  const container = document.getElementById('kwContent');
  const groupOrder = ['productType', 'feature', 'color', 'material', 'shape', 'status'];

  let html = '';
  for (const key of groupOrder) {
    const g = groups[key];
    if (!g || !g.keywords.length) continue;
    const tags = g.keywords.map(kw => {
      const cnHint = kw.cn ? `<span class="cn">${kw.cn}</span>` : '';
      return `<span class="kw-tag" onclick="clickKeyword('${kw.vi.replace(/'/g, "\\'")}')" title="${kw.cn || kw.vi}">${kw.vi}${cnHint}</span>`;
    }).join('');
    html += `
      <div class="kw-group">
        <div class="kw-group-label">${g.icon} ${g.label}</div>
        <div class="kw-tags">${tags}</div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function clickKeyword(keyword) {
  const input = document.getElementById('searchInput');
  const current = input.value.trim();
  if (current) {
    input.value = current + ' ' + keyword;
  } else {
    input.value = keyword;
  }
  state.searchQuery = input.value;
  setSearchMode('ai');
  // Trigger search
  loadAISearch();
}

async function showDetail(id) {
  const overlay = document.getElementById('overlay');
  const content = document.getElementById('detailContent');
  const title = document.getElementById('detailTitle');

  overlay.classList.add('show');
  content.innerHTML = '<div class="loading"><div class="spinner"></div> Đang tải thông tin chi tiết...</div>';
  title.textContent = 'Đang tải...';

  try {
    const res = await fetch(`${API}/api/products/${id}`);
    const d = await res.json();

    title.textContent = d.name || `Sản phẩm #${id}`;

    // Images
    const allImages = (d.images && d.images.length ? d.images : (d.cover ? [d.cover] : [])).map(proxyImg);
    let galleryHtml = '';
    if (allImages.length) {
      galleryHtml = `
        <div class="detail-section">
          <img class="main-image" id="mainImg" src="${allImages[0]}" onerror="this.style.display='none'" />
          ${allImages.length > 1 ? `
            <div class="gallery">
              ${allImages.map((img, i) => `
                <img class="gallery-img ${i === 0 ? 'active' : ''}" src="${img}"
                  onclick="document.getElementById('mainImg').src=this.src;document.querySelectorAll('.gallery-img').forEach(e=>e.classList.remove('active'));this.classList.add('active')" />
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    // Meta tags
    const metaTags = [];
    metaTags.push(`<span class="meta-tag">📦 ${d.sapCode}</span>`);
    if (d.jmbarcode) metaTags.push(`<span class="meta-tag">🏷️ ${d.jmbarcode}</span>`);
    if (d.categoryVi) metaTags.push(`<span class="meta-tag">${d.categoryVi}</span>`);
    const linkLabel = d.source === 'arrow-home.cn' ? '🔗 Xem trên Arrow' : '🔗 Xem trên Jomoo';
    metaTags.push(`<span class="meta-tag"><a href="${d.shareUrl}" target="_blank">${linkLabel}</a></span>`);

    // Spec table
    let specHtml = '';
    if (d.spec) {
      const rows = d.spec.split('\n').filter(Boolean).map(line => {
        const [key, ...vals] = line.split('：');
        return `<tr><td>${key}</td><td>${vals.join('：') || '—'}</td></tr>`;
      }).join('');
      specHtml = `
        <div class="detail-section">
          <h3>📐 Thông số kỹ thuật</h3>
          <table class="spec-table">${rows}</table>
        </div>
      `;
    }

    // Configure list
    let configHtml = '';
    if (d.configure) {
      const items = d.configure.split('\n').filter(Boolean).map(line =>
        `<li>${line.replace(/^\d+、/, '')}</li>`
      ).join('');
      configHtml = `
        <div class="detail-section">
          <h3>🔧 Cấu hình sản phẩm</h3>
          <ol class="config-list">${items}</ol>
        </div>
      `;
    }

    // Attributes
    let attrHtml = '';
    if (d.attributes && d.attributes.length) {
      const groups = d.attributes
        .filter(g => g.items && g.items.length > 0)
        .map(g => {
          const groupName = g.group.replace(/^\d+_/, '');
          const items = g.items.filter(i => i.name && i.value).map(i =>
            `<div class="attr-item"><span class="attr-name">${i.name}</span><span class="attr-value">${i.value}</span></div>`
          ).join('');
          return items ? `
            <div class="attr-group">
              <div class="attr-group-title">${groupName}</div>
              <div class="attr-grid">${items}</div>
            </div>
          ` : '';
        }).join('');
      if (groups) {
        attrHtml = `
          <div class="detail-section">
            <h3>📋 Thuộc tính sản phẩm</h3>
            ${groups}
          </div>
        `;
      }
    }

    content.innerHTML = `
      ${galleryHtml}
      <div class="detail-section">
        <div class="detail-name">${d.name}</div>
        <div class="detail-meta">${metaTags.join('')}</div>
      </div>
      ${specHtml}
      ${configHtml}
      ${attrHtml}
    `;
  } catch (e) {
    console.error('Failed to load detail:', e);
    content.innerHTML = '<div class="empty"><div class="icon">❌</div><p>Không thể tải thông tin sản phẩm</p></div>';
  }
}

function closeDetail() {
  document.getElementById('overlay').classList.remove('show');
}

// Go!
init();
