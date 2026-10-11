"""Árbol muerto, variante 1. Ver tools/blender/nature.py."""

from modeling import reset
from nature import dead_tree


def build():
    reset()
    dead_tree(3)
