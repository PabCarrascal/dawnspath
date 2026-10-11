"""
Entrada para Blender, en el servidor (la lanza run.sh):

    blender -b --factory-startup -P build.py -- <tipo>/<nombre> <carpeta de salida>

- sprites/<nombre>.py: un personaje; escribe <salida>/sprites/<nombre>.png.
- scenes/<nombre>.py: una escena con su propia función render(ruta); escribe
  <salida>/scenes/<nombre>.webp.
- models/<nombre>.py: un modelo 3D con build(); escribe <salida>/models/<nombre>.glb.
"""

import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pixelart  # noqa: E402

target, out = sys.argv[sys.argv.index("--") + 1 :][:2]
kind, name = target.split("/")
module = importlib.import_module(f"{kind}.{name}")
os.makedirs(os.path.join(out, kind), exist_ok=True)
if kind == "scenes":
    module.render(os.path.join(out, kind, f"{name}.webp"))
elif kind == "models":
    import modeling  # noqa: E402

    module.build()
    modeling.export(os.path.join(out, kind, f"{name}.glb"))
else:
    pixelart.sheet(module, os.path.join(out, kind, f"{name}.png"))
