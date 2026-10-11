"""
Entrada para Blender, en el servidor (la lanza run.sh):

    blender -b --factory-startup -P build.py -- <modelo> <carpeta de salida>

Carga sprites/<modelo>.py y escribe <carpeta>/<modelo>.png.
"""

import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pixelart  # noqa: E402

name, out = sys.argv[sys.argv.index("--") + 1 :][:2]
pixelart.sheet(importlib.import_module(f"sprites.{name}"), os.path.join(out, f"{name}.png"))
