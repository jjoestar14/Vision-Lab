import sys
from pathlib import Path

# Tambahkan root direktori ke sys.path agar package web_app bisa diimpor
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from web_app.app import app

# Vercel mencari variabel WSGI bernama 'app'
if __name__ == "__main__":
    app.run()
