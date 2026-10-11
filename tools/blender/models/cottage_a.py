"""Casa de aldea de yeso y entramado, tejado de teja, chimenea y jardineras (2,4 × 1,8)."""

from modeling import cottage, reset


def build():
    reset()
    cottage(2.4, 1.8, 1.6, roof="roof", chimney=0.75, door=-0.15, windows=(-0.8, 0.6), flowers=True)
