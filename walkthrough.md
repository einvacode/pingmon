# 🚀 PingMon - Proxmox Deployment Guide (Non-Docker)

Aplikasi PingMon dirancang untuk berjalan ringan di **LXC Container** Proxmox. Panduan ini akan membantu Anda melakukan instalasi tanpa menggunakan Docker.

---

## 1. Persiapan LXC di Proxmox
1. Buka Proxmox Web UI.
2. Klik **"Create CT"** (LXC Container).
3. Pilih Template: **Debian 12** atau **Ubuntu 22.04/24.04**.
4. Resource yang disarankan:
   - **CPU**: 1 Core
   - **RAM**: 512MB - 1GB
   - **Disk**: 4GB - 8GB
5. Pada bagian **Network**, pastikan container memiliki akses internet untuk mengunduh Node.js.

> [!IMPORTANT]
> Jika menggunakan LXC, pastikan opsi **"Unprivileged container"** dicentang (default). Namun, untuk fitur Ping agar berjalan lancar tanpa root, Anda mungkin perlu menambahkan akses RAW socket. Secara default, script ini menggunakan `iputils-ping` yang aman.

---

## 2. Transfer File ke Server
Gunakan **WinSCP** atau **SCP** untuk memindahkan folder `pingmon` dari komputer Anda ke server Proxmox (direktori yang disarankan: `/opt/pingmon`).

Atau jika Anda menggunakan Terminal:
```bash
# Contoh command scp dari Windows ke Linux
scp -r g:/pingmon root@<IP_PROXMOX>:/opt/
```

---

## 3. Instalasi Otomatis
Setelah file berada di server, masuk ke SSH container dan jalankan script setup:

```bash
cd /opt/pingmon
chmod +x setup.sh
./setup.sh
```

**Apa yang dilakukan script ini?**
- Mengupdate system (apt update).
- Menginstall Node.js v20.
- Menginstall PM2 (Process Manager agar aplikasi jalan di background).
- Menginstall dependensi (npm install).
- Mendaftarkan PingMon ke system startup (otomatis jalan saat Proxmox booting).

---

## 4. Cara Akses & Manajemen
- **Web UI**: Buka `http://<IP_CONTAINER>:3000` di browser Anda.
- **Log Server**: Untuk melihat log sistem, gunakan `pm2 logs pingmon`.
- **Restart**: `pm2 restart pingmon`.
- **Status**: `pm2 status`.

---

## 5. Migrasi Data (Windows ke Proxmox)
Jika Anda sudah memasukkan banyak data di Windows dan ingin memindahkannya ke Proxmox:
1. Di Windows, buka **Settings > Data Management > Download Backup**. Anda akan mendapatkan file `.db`.
2. Setelah instalasi di Proxmox selesai, buka Web UI PingMon di IP Proxmox.
3. Pergi ke **Settings > Restore from Backup File**.
4. Pilih file `.db` tadi dan klik **Restore**.
5. Selesai! Semua perangkat, log, dan logo Anda akan berpindah secara otomatis.

---

## 6. Tips Performa
- **Ping Interval**: Untuk Proxmox, interval **30 detik** sudah sangat efisien.
- **Cleanup**: Sistem akan otomatis menghapus log lama setiap 6 jam (berdasarkan setting `Max Log Days`) agar disk container tidak penuh.

---
*PingMon - Build for Stability.*
