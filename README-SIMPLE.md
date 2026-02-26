# IdeaMill - Simple Setup

## 🚀 Quick Start (Simple & Otomatis)

### 1. Start Development Server
```bash
npm run dev
```

### 2. Start Simple Worker (di terminal baru)
```bash
npm run worker
```

### 3. Done! 🎉
- Buka http://localhost:3000
- Submit generation form
- Worker otomatis memproses semua requests

## 📋 Commands Penting

| Command | Function |
|---------|----------|
| `npm run worker` | Start simple worker |
| `npm run check:jobs` | Check antrian jobs |
| `npm run reset:jobs` | Reset jobs yang stuck |
| `npm run check:db` | Check database connection |

## 🔧 Environment Setup
```bash
npm run setup:env    # Setup .env.local
npm run validate:env # Validasi environment
```

## 📝 Notes
- Worker auto-poll setiap 3 detik
- No complex dependencies
- Fully automated & error handled
- Simple file structure

---
**System sudah siap! Cukup 2 command untuk jalankan semuanya.**