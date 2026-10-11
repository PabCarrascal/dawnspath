#!/usr/bin/env bash
# Renderiza con Blender en el servidor y trae el resultado a public/:
# los personajes de sprites/ a public/sprites/<nombre>.png, las escenas de
# scenes/ (mapa, portada) a public/scenes/ y los modelos 3D de models/
# (edificios del castillo) a public/models/<nombre>.glb.
#
#   npm run assets              # solo lo que ha cambiado desde su último render
#   npm run assets -- --todo    # todo
#   npm run assets -- hero map  # esto, aunque no haya cambiado
#
# Algo está al día si su imagen es más reciente que su script, sus datos
# (scenes/<nombre>.json) y la tubería común (pixelart.py, build.py). Blender
# está instalado en el servidor (snap); aquí no hace falta. Se puede cambiar de
# máquina con BLENDER_HOST, BLENDER_PORT y BLENDER_KEY.
set -euo pipefail

HOST=${BLENDER_HOST:-kayadmin@192.168.1.45}
PORT=${BLENDER_PORT:-3322}
KEY=${BLENDER_KEY:-$HOME/.ssh/linea_deploy}
REMOTE=dawnspath-assets
SSH="ssh -p $PORT -i $KEY -o IdentitiesOnly=yes"

here=$(cd "$(dirname "$0")" && pwd)
public="$here/../../public"

# Datos del mapa sacados del juego (solo reescribe map.json si han cambiado).
(cd "$here/../.." && npx vite-node tools/blender/export-map.ts)

# tipo/nombre de cada modelo y escena, y la imagen que produce.
target() {
  for kind in scenes models; do
    if [ -f "$here/$kind/$1.py" ]; then echo "$kind/$1"; return; fi
  done
  echo "sprites/$1"
}
image() { case "$1" in scenes/*) echo "$public/$1.webp" ;; models/*) echo "$public/$1.glb" ;; *) echo "$public/$1.png" ;; esac; }
all="$(cd "$here" && ls sprites/*.py scenes/*.py models/*.py 2>/dev/null | sed 's/\.py$//' || true)"

todo=""
if [ "${1:-}" = "--todo" ]; then
  todo=$all
elif [ $# -gt 0 ]; then
  for n in "$@"; do todo="$todo $(target "$n")"; done
else
  for t in $all; do
    img=$(image "$t")
    data="$here/$t.json"
    if [ ! -f "$img" ] || [ "$here/$t.py" -nt "$img" ] || [ "$here/pixelart.py" -nt "$img" ] || [ "$here/build.py" -nt "$img" ] || { [ -f "$data" ] && [ "$data" -nt "$img" ]; }; then
      todo="$todo $t"
    fi
  done
  if [ -z "$todo" ]; then
    echo "Todo está al día (npm run assets -- --todo para rehacerlo)."
    exit 0
  fi
fi
echo "Renderizando:" $todo

# Cada ejecución en su propia carpeta del servidor: se pueden lanzar varias a la vez.
run="$REMOTE/run-$(date +%s)-$$"
$SSH "$HOST" "mkdir -p $run"
rsync -az --exclude __pycache__ -e "$SSH" "$here/" "$HOST:$run/blender/"
$SSH "$HOST" "cd $run && mkdir out && for t in $todo; do
  blender -b --factory-startup -P blender/build.py -- \$t out 2>&1 | grep -E '^sprite:|^escena:|^modelo:|Error|Traceback|^  File|^\w+Error' || true
  ls out/\$t.* >/dev/null 2>&1 || { echo \"falló: \$t\"; exit 1; }
done" || { $SSH "$HOST" "rm -rf $run"; exit 1; }
rsync -az -e "$SSH" "$HOST:$run/out/" "$public/"
$SSH "$HOST" "rm -rf $run"
