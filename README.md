# 📡 PingMon - Professional Network Ping Monitor

PingMon adalah aplikasi pemantauan jaringan real-time yang ringan, modern, dan sangat mudah digunakan. Dirancang khusus untuk memantau status perangkat jaringan (UP/DOWN/WARNING) dengan antarmuka yang bersih dan fitur alarm suara yang cerdas.

![Aesthetic Dashboard](https://via.placeholder.com/1200x600/1e293b/ffffff?text=PingMon+Dashboard+Preview)

---

## ✨ Fitur Utama
- 🚀 **Real-time Monitoring**: Update status perangkat setiap beberapa detik secara otomatis.
- 🎨 **Modern UI**: Dark mode dengan desain Glassmorphism yang premium.
- 🔔 **Custom Audio Alarms**: Suara sirine otomatis jika perangkat mati, bisa diganti dengan file `.wav` Anda sendiri.
- 🔇 **Per-Device Mute**: Matikan suara alarm untuk perangkat tertentu yang sedang dalam pemeliharaan.
- 📊 **Uptime Reports**: Grafik latensi dan statistik ketersediaan (%) untuk setiap perangkat.
- 📂 **Data Management**: Fitur Backup & Restore database untuk migrasi yang aman.
- ⚡ **Lightweight**: Menggunakan SQLite (sql.js) sehingga tidak memerlukan instalasi database berat.
- 🏠 **Self-Hosted**: Siap di-deploy di Windows maupun Proxmox (LXC) tanpa Docker.

---

## 🛠️ Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: SQLite (via `sql.js`)
- **Frontend**: Vanilla JS, HTML5, CSS3
- **Icons**: Remix Icon
- **Charts**: Chart.js

---

## 🚀 Instalasi & Penggunaan

### 🪟 Windows (Cara Cepat)
1. Pastikan Anda sudah menginstall [Node.js](https://nodejs.org/).
2. Download folder project ini.
3. Klik dua kali pada file **`start.bat`**.
4. Aplikasi akan otomatis menginstall dependensi dan membuka browser di `http://localhost:3000`.

### 🐧 Linux / Proxmox (Non-Docker)
Sangat direkomendasikan menggunakan **LXC Container** di Proxmox.

1. Buat Container (Debian/Ubuntu).
2. Transfer folder project ke direktori `/opt/pingmon`.
3. Jalankan script setup otomatis:
   ```bash
   cd /opt/pingmon
   chmod +x setup.sh
   ./setup.sh
   ```
4. Akses melalui IP server Anda: `http://<IP_SERVER>:3000`.

---

## ⚙️ Konfigurasi
- **Ping Interval**: Sesuaikan durasi antar pengecekan di menu Settings.
- **Latency Threshold**: Tentukan batas milidetik (ms) untuk status "Warning" (Kuning).
- **Alarm Sound**: Aktifkan/Matikan suara atau upload file `.wav` kustom Anda.
- **Logo & Info Perusahaan**: Personalisasi tampilan dashboard dengan logo dan nama perusahaan Anda sendiri.

---

## 💾 Migrasi Data
Jika Anda pindah server:
1. Klik **Settings > Download Backup** di server lama.
2. Klik **Settings > Restore** di server baru dan pilih file `.db` yang sudah diunduh.

---

## 📝 Lisensi
Project ini dibuat untuk kebutuhan internal monitoring jaringan. Silakan dikembangkan lebih lanjut!

---
*PingMon - Simplify your network monitoring.*
