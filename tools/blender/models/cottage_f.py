"""Casita de piedra con tejado de teja, chimenea y postigos (1,8 × 1,6)."""

from modeling import cottage, reset


def build():
    reset()
    cottage(1.8, 1.6, 1.6, roof="roof", walls="bricks", frame=False, chimney=0.5, door=-0.3, windows=(0.4,), shutters=True)
