# VisionLab — Adaptive Gaussian Thresholding

Aplikasi web pengolahan citra untuk praktikum segmentasi yang difokuskan pada **satu metode: Adaptive Gaussian Thresholding**. Antarmuka memakai gaya _futuristic glassmorphism_ dengan latar navy gelap, panel frosted glass, border cyan tipis, dan tipografi Exo 2.

## Fitur

- Memilih citra sampel yang tersedia di folder `sample_images/`.
- Mengunggah citra sendiri dalam format PNG, JPG/JPEG, WEBP, atau BMP (maksimal 12 MB).
- Mengatur parameter **Block Size** (ganjil, 3–51) dan **Constant C** (-10 sampai 25).
- Opsi Gaussian blur sebagai pra-pemrosesan untuk mengurangi noise.
- Membandingkan citra asli dengan hasil binarisasi.
- Melihat histogram intensitas grayscale, persentase piksel hitam/putih, resolusi, dan waktu proses.
- Mengunduh hasil binarisasi sebagai PNG.
- Layout responsif untuk desktop, tablet, dan ponsel.

## Metode yang digunakan

Aplikasi memakai `cv2.adaptiveThreshold()` dengan `cv2.ADAPTIVE_THRESH_GAUSSIAN_C` dan `cv2.THRESH_BINARY`. Nilai ambang dihitung secara lokal menggunakan rata-rata berbobot Gaussian dari lingkungan piksel. Karena itu, metode ini sesuai untuk eksperimen pada gambar dengan pencahayaan yang tidak merata. Berbeda dari threshold global, metode ini tidak menggunakan satu nilai ambang `T` untuk seluruh gambar.

## Menjalankan di Windows

Pastikan Python 3.10 atau yang lebih baru sudah terpasang. Buka terminal di folder proyek, lalu jalankan:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install --upgrade pip
py -m pip install -r requirements.txt
py web_app\app.py
```

Bila PowerShell memblokir aktivasi virtual environment, instal dependensi dengan `py -m pip install -r requirements.txt` dan jalankan aplikasi menggunakan `py web_app\app.py` tanpa mengaktifkan `.venv`.

Buka alamat berikut di browser:

**http://127.0.0.1:5050**

Hentikan server dengan `Ctrl+C` di terminal.

## Struktur proyek

```text
VisionLabAI03-main/
├── README.md
├── requirements.txt
├── sample_images/             # Citra uji bawaan
└── web_app/
    ├── app.py                 # Flask API dan proses OpenCV
    ├── templates/index.html   # Struktur antarmuka
    ├── static/css/style.css   # Glassmorphism + responsive layout
    ├── static/js/main.js      # Interaksi UI
    └── uploads/               # Gambar unggahan saat aplikasi berjalan
```

## Parameter

- **Block Size**: ukuran area lokal untuk perhitungan Gaussian. Harus berupa angka ganjil dan minimal 3.
- **Constant C**: nilai yang dikurangkan dari rata-rata Gaussian lokal sebelum menentukan kelas piksel.
- **Gaussian blur (opsional)**: melakukan penghalusan awal dengan kernel 5×5 untuk membantu mengurangi noise; fitur ini terpisah dari perhitungan Gaussian lokal pada Adaptive Gaussian Thresholding.

Nilai parameter terbaik bergantung pada resolusi, kontras, dan kondisi pencahayaan citra. Bandingkan beberapa kombinasi untuk mendapatkan hasil yang paling sesuai.

## Referensi dataset citra

Untuk eksperimen dokumen nyata, salah satu sumber yang bisa dieksplorasi adalah **DIBCO (Document Image Binarization Contest)**, yang menyediakan citra dokumen untuk evaluasi binarisasi:

- Situs DIBCO 2019: https://vc.ee.duth.gr/dibco2019/
- Alternatif sample untuk eksperimen awal: citra pada folder `sample_images/` dalam proyek ini.

Folder `sample_images/` berisi contoh dari template proyek dan bukan salinan dataset DIBCO. Periksa syarat penggunaan dataset dari sumber aslinya jika citra akan dipublikasikan atau didistribusikan ulang.
