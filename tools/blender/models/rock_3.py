"""Roca plana, variante 1. Ver tools/blender/nature.py."""

from modeling import reset
from nature import rock


def build():
    reset()
    rock(4, flat=True)
