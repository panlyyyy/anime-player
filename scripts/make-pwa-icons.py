#!/usr/bin/env python3
"""Buat ikon PWA sederhana (persegi indigo). Butuh: pip install pillow"""
import os
import sys
try:
    from PIL import Image
except ImportError:
    print("Instal dulu: pip install pillow")
    sys.exit(1)
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)
for size in (192, 512):
    img = Image.new("RGB", (size, size), (99, 102, 241))
    img.save(os.path.join(OUT, f"icon-{size}.png"))
print("Icons saved to public/icons/")
