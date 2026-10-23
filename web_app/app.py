"""VisionLab — Adaptive Gaussian Thresholding workspace.

A small Flask + OpenCV app focused on one segmentation technique:
Adaptive Gaussian Thresholding.
"""

from __future__ import annotations

import base64
import os
import time
import uuid
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024  # 12 MB per upload

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
SAMPLE_DIR = PROJECT_DIR / "sample_images"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "bmp", "webp"}
DEFAULT_IMAGE = "peach.jpg"
MAX_IMAGE_PIXELS = 28_000_000

SAMPLE_LABELS = {
    "Peach.jpg": "Buah Peach",
    "Lights.jpg": "Lampu",
    "Coins.jpg": "Koin",
    "Painting.jpg": "Lukisan",
    "Leaf.jpg": "Daun",
}


def encode_image(image: np.ndarray) -> str:
    """Encode an OpenCV image as a PNG data URL."""
    success, buffer = cv2.imencode(".png", image)
    if not success:
        return ""
    encoded = base64.b64encode(buffer).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def decode_upload(raw: bytes) -> np.ndarray | None:
    """Decode image bytes without trusting the uploaded filename."""
    if not raw:
        return None
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return None
    height, width = image.shape[:2]
    if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
        return None
    return image


def resolve_image(image_id: str | None) -> np.ndarray | None:
    """Resolve only filenames inside the sample or upload directories."""
    if image_id is not None and not isinstance(image_id, str):
        return None
    filename = os.path.basename(image_id or DEFAULT_IMAGE)
    if filename != image_id and image_id is not None:
        return None

    for directory in (UPLOAD_DIR, SAMPLE_DIR):
        path = directory / filename
        if path.is_file() and path.suffix.lower().lstrip(".") in ALLOWED_EXTENSIONS | {"png"}:
            image = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if image is not None:
                h, w = image.shape[:2]
                if w * h <= MAX_IMAGE_PIXELS:
                    return image
    return None


def make_thumbnail(image: np.ndarray, max_side: int = 160) -> np.ndarray:
    height, width = image.shape[:2]
    scale = min(max_side / max(width, height), 1.0)
    if scale == 1.0:
        return image.copy()
    return cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA)


def get_sample_display_name(filename: str) -> str:
    return SAMPLE_LABELS.get(filename, Path(filename).stem.replace("_", " ").title())


@app.errorhandler(413)
def payload_too_large(_error):
    return jsonify({"error": "Ukuran gambar terlalu besar. Maksimal 12 MB."}), 413


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/samples", methods=["GET"])
def get_samples():
    samples = []
    if SAMPLE_DIR.exists():
        for path in sorted(SAMPLE_DIR.iterdir()):
            if not path.is_file() or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".bmp", ".webp"}:
                continue
            image = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if image is None:
                continue
            height, width = image.shape[:2]
            samples.append({
                "id": path.name,
                "name": get_sample_display_name(path.name),
                "filename": path.name,
                "thumb": encode_image(make_thumbnail(image)),
                "width": width,
                "height": height,
            })
    samples.sort(key=lambda item: (item["id"] != DEFAULT_IMAGE, item["name"].lower()))
    return jsonify({"samples": samples})


@app.route("/api/upload", methods=["POST"])
def upload_image():
    uploaded_file = request.files.get("file")
    if uploaded_file is None or not uploaded_file.filename:
        return jsonify({"error": "Pilih gambar terlebih dahulu."}), 400

    original_name = secure_filename(uploaded_file.filename)
    extension = Path(original_name).suffix.lower().lstrip(".")
    if extension not in ALLOWED_EXTENSIONS:
        return jsonify({"error": "Format yang didukung: PNG, JPG, JPEG, BMP, atau WEBP."}), 415

    image = decode_upload(uploaded_file.read())
    if image is None:
        return jsonify({"error": "File bukan citra yang valid, atau resolusinya terlalu besar."}), 400

    image_id = f"upload_{uuid.uuid4().hex}.png"
    saved_path = UPLOAD_DIR / image_id
    if not cv2.imwrite(str(saved_path), image):
        return jsonify({"error": "Gagal menyimpan gambar yang diunggah."}), 500

    height, width = image.shape[:2]
    return jsonify({
        "success": True,
        "id": image_id,
        "name": original_name or "Uploaded image",
        "display_name": Path(original_name).stem or "Uploaded image",
        "thumb": encode_image(make_thumbnail(image)),
        "width": width,
        "height": height,
    })


@app.route("/api/threshold", methods=["POST"])
def process_threshold():
    data = request.get_json(silent=True) or {}
    image_id = data.get("image_id", DEFAULT_IMAGE)
    image = resolve_image(image_id)
    if image is None:
        return jsonify({"error": "Citra tidak ditemukan. Pilih sampel atau unggah gambar lagi."}), 404

    try:
        block_size = int(data.get("block_size", 15))
        c_value = int(data.get("c", 4))
    except (TypeError, ValueError):
        return jsonify({"error": "Parameter Block Size dan C harus berupa angka."}), 400

    block_size = max(3, min(51, block_size))
    if block_size % 2 == 0:
        block_size = block_size + 1 if block_size < 51 else 49
    c_value = max(-10, min(25, c_value))
    apply_blur = bool(data.get("apply_blur", False))

    start_time = time.perf_counter()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    working_gray = cv2.GaussianBlur(gray, (5, 5), 0) if apply_blur else gray

    result = cv2.adaptiveThreshold(
        working_gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block_size,
        c_value,
    )
    elapsed_ms = (time.perf_counter() - start_time) * 1000

    histogram = cv2.calcHist([gray], [0], None, [256], [0, 256]).ravel().astype(int).tolist()
    total_pixels = result.size
    white_pixels = int(cv2.countNonZero(result))
    black_pixels = total_pixels - white_pixels
    height, width = gray.shape[:2]

    return jsonify({
        "original": encode_image(image),
        "grayscale": encode_image(gray),
        "result": encode_image(result),
        "histogram": histogram,
        "method": "Adaptive Gaussian Thresholding",
        "block_size": block_size,
        "c": c_value,
        "apply_blur": apply_blur,
        "width": width,
        "height": height,
        "pixels": total_pixels,
        "black_pixels": black_pixels,
        "white_pixels": white_pixels,
        "black_percent": round((black_pixels / total_pixels) * 100, 1),
        "white_percent": round((white_pixels / total_pixels) * 100, 1),
        "processing_ms": round(elapsed_ms, 2),
    })


if __name__ == "__main__":
    print("VisionLab tersedia di http://127.0.0.1:5050")
    app.run(host="127.0.0.1", port=5050, debug=False)
