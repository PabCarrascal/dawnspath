"""Casa de dos plantas, con el piso de arriba volado sobre la calle, postigos y chimenea (2,6 × 1,8)."""

from modeling import cottage, reset


def build():
    reset()
    cottage(2.6, 1.8, 2.0, roof="roof", upper=True, chimney=-0.8, door=0.0, windows=(-0.8, 0.8), shutters=True)
