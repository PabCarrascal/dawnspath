"""Roca plana, variante 2. Ver tools/blender/nature.py."""

from modeling import reset
from nature import rock


def build():
    reset()
    rock(15, flat=True)
