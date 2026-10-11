#!/usr/bin/env bash
# Genera las hojas de sprites con Blender en el servidor y las trae a public/sprites/.
#
#   npm run assets              # solo los modelos cambiados desde su último PNG
#   npm run assets -- --todo    # todos los de tools/blender/sprites/
#   npm run assets -- hero      # estos, aunque no hayan cambiado
#
# Un modelo está al día si su PNG es más reciente que su script y que la
# tubería común (pixelart.py, build.py). Blender está instalado en el servidor
# (snap); aquí no hace falta. Se puede cambiar de máquina con BLENDER_HOST,
# BLENDER_PORT y BLENDER_KEY.
set -euo pipefail

HOST=${BLENDER_HOST:-kayadmin@192.168.1.45}
PORT=${BLENDER_PORT:-3322}
KEY=${BLENDER_KEY:-$HOME/.ssh/linea_deploy}
REMOTE=dawnspath-assets
SSH="ssh -p $PORT -i $KEY -o IdentitiesOnly=yes"

here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../public/sprites"
all=$(cd "$here/sprites" && ls *.py | sed 's/\.py$//')

todo=""
if [ "${1:-}" = "--todo" ]; then
  todo=$all
elif [ $# -gt 0 ]; then
  todo="$*"
else
  for m in $all; do
    png="$out/$m.png"
    if [ ! -f "$png" ] || [ "$here/sprites/$m.py" -nt "$png" ] || [ "$here/pixelart.py" -nt "$png" ] || [ "$here/build.py" -nt "$png" ]; then
      todo="$todo $m"
    fi
  done
  if [ -z "$todo" ]; then
    echo "Todos los sprites están al día (npm run assets -- --todo para rehacerlos)."
    exit 0
  fi
fi
echo "Renderizando:" $todo

$SSH "$HOST" "mkdir -p $REMOTE"
rsync -az --delete --exclude __pycache__ -e "$SSH" "$here/" "$HOST:$REMOTE/blender/"
$SSH "$HOST" "cd $REMOTE && rm -rf out && mkdir out && for m in $todo; do
  blender -b --factory-startup -P blender/build.py -- \$m out 2>&1 | grep -E '^sprite:|Error|Traceback|^  File|^\w+Error' || true
  test -f out/\$m.png || { echo \"falló: \$m\"; exit 1; }
done"
mkdir -p "$out"
rsync -az -e "$SSH" "$HOST:$REMOTE/out/" "$out/"
