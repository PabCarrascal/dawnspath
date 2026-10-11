"""Casa alta de tablas con tejado de paja y un porche sobre la puerta (2,0 × 1,6)."""

from modeling import cottage, reset


def build():
    reset()
    cottage(2.0, 1.6, 1.9, roof="thatch", walls="planks", frame=False, door=0.25, windows=(-0.5,), porch=True)
