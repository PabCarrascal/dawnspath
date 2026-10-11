"""Casa baja de yeso con tejado de paja, jardineras y un cobertizo al lado (2,0 × 1,6)."""

from modeling import cottage, reset


def build():
    reset()
    cottage(2.0, 1.6, 1.5, roof="thatch", door=0.3, windows=(-0.45,), flowers=True, shed=-1)
