"""
Taberna del castillo: planta baja de piedra y un piso de entramado que vuela sobre
ella, tejado de teja, chimenea, ventanas que se encienden de noche y un letrero
con la jarra. Planta de 3,0 × 2,0 como la de antes.
"""

from modeling import beam, box, gable, reset

W, D = 3.0, 2.0
GROUND, UPPER = 1.1, 1.1
OVER = 0.12


def build():
    reset()
    box("bricks", (W, D, GROUND), (0, 0, GROUND / 2))
    # El piso de arriba vuela un poco sobre la calle, con su entramado.
    top = GROUND + UPPER
    box("plaster", (W + 2 * OVER, D + 2 * OVER, UPPER), (0, 0, GROUND + UPPER / 2))
    y = -D / 2 - OVER - 0.03
    for z in (GROUND + 0.04, top - 0.04):
        box("timber", (W + 2 * OVER + 0.05, 0.08, 0.09), (0, y, z))
    for x in (-1.55, -0.52, 0.52, 1.55):
        box("timber", (0.09, 0.08, UPPER), (x, y, GROUND + UPPER / 2))
    for x0, x1 in ((-1.55, -0.52), (0.52, 1.55)):
        beam("timber", (x0, y, GROUND + 0.05), (x1, y, top - 0.05))
    # Canecillos bajo el vuelo.
    for x in (-1.3, -0.4, 0.4, 1.3):
        box("timber", (0.1, 0.24, 0.1), (x, -D / 2 - 0.08, GROUND - 0.05))
    gable("roof", W + 0.6, D + 0.7, 1.15, top)
    box("bricks", (0.42, 0.42, 1.5), (-0.95, 0.3, top + 0.75))
    box("stone", (0.52, 0.52, 0.1), (-0.95, 0.3, top + 1.52))
    # Puerta en arco (tablas y dintel) y ventanas: dos abajo, tres arriba con postigos.
    box("planks", (0.6, 0.06, 0.95), (0, -D / 2 - 0.03, 0.48))
    box("timber", (0.74, 0.07, 0.1), (0, -D / 2 - 0.04, 0.98))
    for x in (-1.0, 1.0):
        box("window", (0.42, 0.05, 0.36), (x, -D / 2 - 0.02, 0.62))
        box("timber", (0.5, 0.07, 0.06), (x, -D / 2 - 0.05, 0.42))
    for x in (-1.03, 0.0, 1.03):
        box("window", (0.32, 0.05, 0.38), (x, y + 0.02, GROUND + 0.6))
        for s in (-1, 1):
            box("planks", (0.14, 0.04, 0.4), (x + s * 0.25, y - 0.01, GROUND + 0.6))
    # Letrero con la jarra, colgado del piso.
    box("iron", (0.55, 0.04, 0.04), (1.35, -D / 2 - 0.4, GROUND - 0.12))
    box("planks", (0.42, 0.04, 0.34), (1.45, -D / 2 - 0.42, GROUND - 0.36))
    box("gold", (0.14, 0.05, 0.18), (1.42, -D / 2 - 0.45, GROUND - 0.36))
    box("gold", (0.05, 0.05, 0.1), (1.53, -D / 2 - 0.45, GROUND - 0.34))
