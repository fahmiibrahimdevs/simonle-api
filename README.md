# 🌊 SIMONLE Backend REST API & Telemetry Ingestion Engine

> **High-Performance IoT Telemetry, Automation, and Actuator Control Engine for Catfish Farming Monitoring System (SIMONLE)**

![Bun](https://img.shields.io/badge/Bun-v1.4+-black?logo=bun)
![Hono](https://img.shields.io/badge/Framework-Hono-orange?logo=hono)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_16-blue?logo=postgresql)
![MQTT](https://img.shields.io/badge/Protocol-MQTT_v5-purple?logo=eclipsemosquitto)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📌 Deskripsi Singkat

**SIMONLE API** adalah layanan backend berkinerja tinggi yang menghubungkan perangkat mikrokontroler (**NodeMCU ESP8266**), **MQTT Broker**, dan aplikasi mobile (**Flutter**) secara *real-time*. 

Backend ini dirancang khusus untuk meminimalkan latensi (*sub-millisecond in-memory cache*) dan menghemat beban CPU & Disk database hingga **80%** menggunakan sistem *batch write buffer* serta **BRIN (Block Range Index)** pada PostgreSQL.

---

## 🚀 Fitur Utama

1. **⚡ Ultra-Fast RAM Cache (< 1ms)**:
   - Menyimpan snapshot sensor live di memori untuk melayani `GET /api/sensors/realtime` secara instan tanpa membebani database.
2. **📦 Smart Batch Ingestion Buffer**:
   - Menampung telemetri 1-detik dari NodeMCU dan melakukan *multi-row insert* ke PostgreSQL per 10 detik / 10 baris.
3. **📊 Dynamic SQL Downsampling & Aggregation**:
   - Agregasi otomatis untuk grafik riwayat telemetri (`1h`, `24h`, `7d`, `30d`, `90d`).
4. **📥 Ekspor Data (CSV & Excel .xlsx)**:
   - Unduhan data telemetri historis terfilter dengan formatting spreadsheet otomatis.
5. **⚙️ Real-time Config & Actuator Synchronization**:
   - Perubahan ambang batas (*threshold*), *timing* pompa, dan saklar manual langsung di-publish dengan flag *retained* ke broker MQTT NodeMCU.
6. **💾 Backup & Restore Database**:
   - Unduh dump `.sql` PostgreSQL dan unggah *restore* via multipart HTTP API.

---

## 🛠️ Tech Stack & Arsitektur

- **Runtime**: [Bun](https://bun.sh/) (v1.4+) / Node.js
- **Web Framework**: [Hono](https://hono.dev/)
- **Database**: PostgreSQL 16 dengan **BRIN Indexing**
- **Messaging / Protocol**: MQTT (Paho / MQTT.js)
- **Spreadsheet Engine**: ExcelJS
- **Process Manager**: PM2

```
[ NodeMCU ESP8266 ] 
       │
       ▼ (MQTT Publish: sensor, alert, automation)
[ MQTT Broker (103.197.188.199:1883) ]
       │
       ▼ (Subscribe & Batch Ingestion)
[ SIMONLE Backend Service (Hono + Bun) ] ─── (RAM Cache < 1ms)
       │
       ▼ (Batch Write / Query Aggregation)
[ PostgreSQL 16 (BRIN Indexing) ]
       ▲
       │ (REST JSON API & HTTPS)
[ Flutter Mobile App (SIMONLE) ]
```

---

## 📡 Daftar Endpoint REST API

### 1. Healthcheck & Realtime
- `GET /health` : Status server, uptime, dan koneksi broker MQTT.
- `GET /api/sensors/realtime` : Snapshot sensor real-time dari RAM Cache.

### 2. Telemetri & Histori Sensor
- `GET /api/sensors/history?range={1h,24h,7d,30d,90d}&limit={n}&offset={n}` : Histori telemetri untuk grafik & tabel.
- `GET /api/sensors/export/count?startDate={iso}&endDate={iso}` : Hitung total data terfilter.
- `GET /api/sensors/export/csv?sensors={wl,temp,tds,ph}&startDate={iso}&endDate={iso}` : Download file CSV.
- `GET /api/sensors/export/excel?sensors={wl,temp,tds,ph}&startDate={iso}&endDate={iso}` : Download file Excel (`.xlsx`).

### 3. Konfigurasi Sistem & Backup
- `GET /api/config` : Ambil konfigurasi aktif threshold, timing, dan offset kalibrasi.
- `PUT /api/config` : Update konfigurasi dan sinkronkan ke MQTT NodeMCU.
- `GET /api/config/backup` : Download dump database PostgreSQL (`.sql`).
- `POST /api/config/import` : Restore database dari file `.sql` (multipart upload).

### 4. Kontrol Aktuator & Siklus Otomasi
- `GET /api/actuators/logs?limit={n}` : Riwayat log saklar pompa dan valve.
- `POST /api/actuators/control` : Kontrol saklar manual (`pompa_inlet`, `pompa_outlet`, `bv_open`, `bv_close`).
- `GET /api/automation/cycles?limit={n}&offset={n}` : Riwayat siklus pompa otomasi.

### 5. Notifikasi & Alert
- `GET /api/alerts?unread_only={bool}&limit={n}&offset={n}` : Daftar alert peringatan sistem.
- `PATCH /api/alerts/:id/read` : Tandai notifikasi tertentu telah dibaca.
- `PATCH /api/alerts/read-all` : Tandai semua notifikasi telah dibaca.

---

## ⚙️ Menjalankan Secara Lokal

### 1. Prasyarat
- [Bun](https://bun.sh/) terinstal (`curl -fsSL https://bun.sh/install | bash`)
- PostgreSQL 16 berjalan secara lokal

### 2. Instalasi & Setup
```bash
# Clone repositori
git clone https://github.com/fahmiibrahimdevs/simonle-api.git
cd simonle-api

# Salin konfigurasi environment
cp .env.example .env
# Sesuaikan isi .env dengan kredensial database dan MQTT Anda

# Install dependensi
bun install

# Jalankan migrasi database
psql -h 127.0.0.1 -U simonle_user -d simonle_db -f src/db/schema.sql

# Jalankan server mode development
bun run dev
```

---

## 🚢 Deployment ke VPS (Production)

```bash
# Jalankan dengan PM2
pm2 start "bun run src/index.ts" --name simonle-backend

# Simpan proses agar otomatis aktif saat server reboot
pm2 save
pm2 startup
```

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).
Dikembangkan oleh **Fahmi Ibrahim** untuk ekosistem monitoring kolam lele **SIMONLE**.
