# Jomoo Market Dashboard

## Overview
Dashboard tư vấn sản phẩm JOMOO (thiết bị vệ sinh, phòng tắm). Lọc sản phẩm theo danh mục, trạng thái, tìm kiếm, và xem chi tiết (ảnh, thông số kỹ thuật, thuộc tính) khi tư vấn khách hàng.

## Tech Stack
- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JS (SPA, single file)
- **Data**: `products.json` (39,628 sản phẩm, ~15MB)
- **External API**: Jomoo mobile API (proxy qua backend)
- **Deploy**: Docker, port 8765

## Architecture

```
Client (browser)
  │
  ├─ GET /                    → public/index.html
  ├─ GET /api/categories      → Danh mục + số lượng
  ├─ GET /api/products?...    → Filter/search sản phẩm
  ├─ GET /api/products/:id    → Chi tiết (proxy Jomoo API)
  └─ GET /api/status          → Health check
  │
  └─ server.js (Express)
       ├─ products.json (in-memory)
       ├─ Jomoo API proxy (POST, with cache)
       └─ static files → public/
```

## API Endpoints

### `GET /api/categories`
Trả về danh sách danh mục, sắp xếp theo số lượng giảm dần.
```json
[{ "name": "Shower / Sen tắm", "nameVi": "Sen tắm", "icon": "🚿", "count": 5118 }]
```

### `GET /api/products`
Query params:
| Param | Type | Mô tả |
|---|---|---|
| `q` | string | Tìm theo tên hoặc mã SAP |
| `category` | string | Lọc danh mục (comma-separated) |
| `status` | string | Lọc trạng thái (comma-separated): `在市`, `已下市`, `已停产`, `内部在市`, `项目定制` |
| `channel` | string | Lọc kênh bán (comma-separated) |
| `page` | int | Trang (default: 1) |
| `limit` | int | Số SP/trang (default: 50, max: 200) |

Response:
```json
{
  "total": 5118,
  "page": 1,
  "limit": 50,
  "totalPages": 103,
  "products": [{
    "id": 145,
    "name": "一键启动恒温淋浴花洒（机械版）",
    "sapCode": "36347-002/1A-1",
    "category": "Shower / Sen tắm",
    "categoryVi": "Sen tắm",
    "categoryIcon": "🚿",
    "cover": "https://...",
    "shareUrl": "https://mobile.jomoo.com/...",
    "onlineStatus": [{ "raw": "在市", "label": "Đang bán", "color": "#10b981" }],
    "channels": ["终端销售", "国外"]
  }]
}
```

### `GET /api/products/:id`
Chi tiết sản phẩm (gọi Jomoo API + cache 24h):
```json
{
  "id": 145,
  "name": "...",
  "sapCode": "36347-002/1A-1",
  "category": "Shower / Sen tắm",
  "categoryVi": "Sen tắm",
  "shareUrl": "https://...",
  "cover": "https://...",
  "images": ["https://...", ...],
  "configure": "1、阀体\n2、把手\n...",
  "spec": "进水口中心距：150\n外接螺纹G1/2B\n...",
  "jmbarcode": "6957210292067",
  "displayItem": "表面处理,颜色,外形,材质,...",
  "attributes": [{
    "group": "30_设计属性",
    "items": [{ "name": "颜色", "value": "镀铬" }]
  }]
}
```

### `GET /api/status`
```json
{ "totalProducts": 39628, "cacheSize": 42, "uptime": 3600 }
```

## Jomoo External API (reverse-engineered)
Both endpoints: `POST https://mobile.jomoo.com/mpm/api/v1/product/share/...`

| Endpoint | Body | Response |
|---|---|---|
| `getProductInfoBase` | `{ "id": "145" }` | Ảnh, kênh bán, trạng thái |
| `getProductDetailInfo` | `{ "id": "145" }` | Thông số, cấu hình, thuộc tính (flsxs) |

- Chỉ hỗ trợ POST, không hỗ trợ GET
- Response: `{ "status": true, "detail": { ... } }`
- `flsxs`: array of attribute groups, each has `attrGroupName` + `flsxNameValuePair[]`

## Data: products.json
Format: array of 39,628 objects:
```json
{
  "id": 30,
  "name": "长方形预埋盒",           // Tên tiếng Trung
  "sapCode": "02108-00-1",        // Mã SAP
  "category": "Other / Khác",     // Danh mục (EN/VI)
  "channels": ["终端销售", "国外"],  // Kênh bán
  "onlineStatus": ["已下市"],       // Trạng thái
  "cover": "https://...",          // Ảnh thumbnail
  "shareUrl": "https://..."        // Link Jomoo
}
```

### Category Distribution (top 10)
| Category | Count |
|---|---|
| Other / Khác | 16,141 |
| Shower / Sen tắm | 5,118 |
| Bathroom Cabinet / Tủ phòng tắm | 4,038 |
| Faucet / Vòi | 2,544 |
| Toilet / Bồn cầu | 2,495 |
| Main Cabinet / Tủ chính | 1,945 |
| Mirror Cabinet / Tủ gương | 1,241 |
| Sink / Bồn rửa | 790 |
| Bathtub / Bồn tắm | 788 |
| Floor Drain / Cống sàn | 424 |

Total: 51 danh mục

## Status Mapping
| Code | Tiếng Việt | Color |
|---|---|---|
| 在市 | Đang bán | green |
| 已下市 | Ngưng bán | gray |
| 已停产 | Ngưng sản xuất | red |
| 内部在市 | Nội bộ | orange |
| 临时上市 | Tạm thời | blue |
| 项目定制 | Dự án riêng | purple |

## Vietnamese UI Labels
Defined in `server.js` → `CATEGORY_VI` and `STATUS_VI` objects.
Frontend sidebar shows categories with emoji icons and product counts.

## Deployment

### Docker (recommended)
```bash
git clone https://github.com/dinhhieudl/jomoo-market.git
cd jomoo-market
docker build -t jomoo-dashboard .
docker run -d --name jomoo -p 8765:8765 --restart unless-stopped jomoo-dashboard
```

### Direct (no Docker)
```bash
cd jomoo-market
npm install
PORT=8765 node server.js
```

### Access
- Local: `http://localhost:8765`
- LAN: `http://<server-ip>:8765`

## File Structure
```
jomoo-market/
├── products.json        # Raw data (39,628 products, 15MB)
├── progress.json        # Crawl progress metadata
├── server.js            # Express backend (API + static)
├── public/
│   └── index.html       # SPA frontend (dark theme, Vietnamese)
├── package.json
├── Dockerfile
├── .dockerignore
├── .gitignore
└── docs/PROJECT.md      # This file
```

## Known Limitations
1. **Search language**: Tìm kiếm hoạt động trên tên/mã SAP (tiếng Trung). Không search được theo từ khóa tiếng Việt.
2. **No pagination cache**: Mỗi request filter lại scan toàn bộ array (39K items). OK cho single-user nhưng cần optimize nếu nhiều user.
3. **Detail cache**: In-memory, mất khi restart container. Có thể thêm Redis/file cache nếu cần.
4. **Jomoo API dependency**: Chi tiết sản phẩm phụ thuộc API bên thứ ba. Nếu Jomoo đổi API thì cần reverse-engineer lại.

## Future Improvements
- [ ] Bảng mapping từ khóa tiếng Việt → sản phẩm (search tiếng Việt)
- [ ] Pagination cache hoặc index cho filter nhanh hơn
- [ ] Export CSV/Excel danh sách sản phẩm đã lọc
- [ ] So sánh 2-3 sản phẩm cạnh nhau
- [ ] Lưu sản phẩm yêu thích (localStorage)
- [ ] File-based detail cache (persist qua restart)
