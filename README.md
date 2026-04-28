# 🏠 Jomoo Market Dashboard

Dashboard tư vấn sản phẩm JOMOO (thiết bị vệ sinh, phòng tắm) và ARROW (箭牌). Hỗ trợ lọc, tìm kiếm tự nhiên tiếng Việt, và xem chi tiết sản phẩm.

## ✨ Tính năng

- **📋 Lọc sản phẩm** — Theo danh mục, trạng thái, thương hiệu, kênh bán
- **🤖 Tìm kiếm AI** — Tìm kiếm tự nhiên tiếng Việt không cần LLM (VD: "sen cây ổn định nhiệt phím đàn")
- **🔍 Fuzzy search** — Tìm gần đúng, chịu lỗi gõ sai
- **📊 So sánh sản phẩm** — Xem 2-3 sản phẩm cạnh nhau
- **❤️ Yêu thích** — Lưu sản phẩm yêu thích (localStorage)
- **📥 Export CSV** — Xuất danh sách sản phẩm đã lọc
- **🌙 Dark theme** — Giao diện tối, dễ nhìn
- **📱 Responsive** — Hoạt động trên mobile và desktop

## 🛠️ Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JS (SPA)
- **Data**: `products.json` (~40K sản phẩm)
- **Logging**: Pino
- **Search**: Custom keyword mapping + Fuse.js fuzzy search
- **Deploy**: Docker

## 🚀 Quick Start

### Docker (recommended)

```bash
git clone https://github.com/dinhhieudl/jomoo-market.git
cd jomoo-market
docker build -t jomoo-dashboard .
docker run -d --name jomoo -p 8765:8765 --restart unless-stopped jomoo-dashboard
```

### Direct

```bash
git clone https://github.com/dinhhieudl/jomoo-market.git
cd jomoo-market
npm install
PORT=8765 node server.js
```

Truy cập: `http://localhost:8765`

## 📡 API Endpoints

| Endpoint | Method | Mô tả |
|---|---|---|
| `/api/categories` | GET | Danh mục + số lượng |
| `/api/brands` | GET | Thương hiệu + số lượng |
| `/api/products` | GET | Lọc/tìm kiếm sản phẩm |
| `/api/products/:id` | GET | Chi tiết sản phẩm |
| `/api/ask?q=` | GET | Tìm kiếm AI tự nhiên |
| `/api/keywords` | GET | Danh sách từ khóa AI |
| `/api/compare?ids=` | GET | So sánh sản phẩm (max 3) |
| `/api/export` | GET | Export CSV |
| `/api/status` | GET | Health check |

### Filter params (`/api/products`)

| Param | Type | Mô tả |
|---|---|---|
| `q` | string | Tìm theo tên hoặc mã SAP |
| `category` | string | Danh mục (comma-separated) |
| `status` | string | Trạng thái (comma-separated) |
| `brand` | string | Thương hiệu (comma-separated) |
| `channel` | string | Kênh bán (comma-separated) |
| `page` | int | Trang (default: 1) |
| `limit` | int | SP/trang (default: 50, max: 200) |

### AI Search (`/api/ask`)

```bash
curl "http://localhost:8765/api/ask?q=sen+cây+ổn+định+nhiệt&limit=10"
```

Hỗ trợ: tên sản phẩm tiếng Việt, tính năng, màu sắc, chất liệu, hình dạng.

## 🧪 Tests

```bash
node tests/sprint1.test.js   # Foundation tests (17 tests)
node tests/sprint2.test.js   # Feature tests (12 tests)
node tests/sprint3.test.js   # Polish tests (19 tests)
node tests/test-ai-search.js # AI search tests (22 tests)
```

## 📁 Cấu trúc dự án

```
jomoo-market/
├── server.js              # Express backend (API + static)
├── ai-search.js           # Vietnamese NLP search module
├── products.json           # Product data (~40K items)
├── public/
│   ├── index.html          # SPA structure
│   ├── style.css           # Styles (dark theme)
│   └── app.js              # Frontend logic
├── cache/
│   └── details.json        # Persistent product detail cache
├── tests/
│   ├── sprint1.test.js     # Foundation tests
│   ├── sprint2.test.js     # Feature tests
│   ├── sprint3.test.js     # Polish tests
│   └── test-ai-search.js   # AI search unit tests
├── .github/workflows/
│   └── test.yml            # CI pipeline
├── Dockerfile
└── docs/PROJECT.md         # Detailed project docs
```

## 📄 License

Private project.
