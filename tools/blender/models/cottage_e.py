"""Cabaña de tablas con tejado de paja y leña apilada delante (1,8 × 1,6)."""

from modeling import cottage, reset


def build():
    reset()
    cottage(1.8, 1.6, 1.5, roof="thatch", walls="planks", frame=False, plinth=False, door=0.35, windows=(-0.35,), logs=True)
