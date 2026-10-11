"""
Herrería del castillo: casa de piedra con tejado de pizarra y una gran chimenea,
portón de tablas, un tejadillo sobre la fragua (que pone el juego delante, a la
derecha) y un letrero de hierro con el yunque. Planta de 2,4 × 1,8 como la de antes.
"""

from modeling import box, cylinder, gable, lean_to, reset

W, D, H = 2.4, 1.8, 1.4


def build():
    reset()
    box("bricks", (W, D, H), (0, 0, H / 2))
    # Sillares de las esquinas, algo salientes.
    for sx in (-1, 1):
        for sy in (-1, 1):
            box("stone", (0.2, 0.2, H + 0.05), (sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), (H + 0.05) / 2))
    gable("slate", W + 0.35, D + 0.4, 0.95, H)
    # Chimenea de la fragua, atravesando el faldón de atrás.
    box("bricks", (0.45, 0.45, 1.6), (0.7, 0.25, H + 0.8))
    box("stone", (0.55, 0.55, 0.12), (0.7, 0.25, H + 1.62))
    # Portón de tablas con su marco y bisagras.
    box("timber", (0.86, 0.06, 1.1), (-0.45, -D / 2 - 0.02, 0.55))
    box("planks", (0.72, 0.06, 0.98), (-0.45, -D / 2 - 0.04, 0.49))
    for z in (0.25, 0.75):
        box("iron", (0.6, 0.07, 0.05), (-0.45, -D / 2 - 0.06, z))
    # Ventana alta y ventanuco junto a la chimenea.
    box("window", (0.26, 0.05, 0.3), (0.55, -D / 2 - 0.02, 1.0))
    box("timber", (0.34, 0.06, 0.05), (0.55, -D / 2 - 0.03, 0.83))
    # Tejadillo sobre la fragua, con dos postes.
    lean_to("slate", 1.25, 0.95, 1.05, 0.82, 0.62, -D / 2)
    for x in (0.08, 1.16):
        box("timber", (0.08, 0.08, 0.82), (x, -D / 2 - 0.88, 0.41))
    # Letrero colgado: brazo de hierro y tabla con el yunque.
    box("iron", (0.5, 0.04, 0.04), (-1.1, -D / 2 - 0.26, 1.18))
    box("planks", (0.36, 0.04, 0.28), (-1.2, -D / 2 - 0.28, 0.98))
    box("iron", (0.2, 0.05, 0.06), (-1.2, -D / 2 - 0.31, 1.0))
    box("iron", (0.08, 0.05, 0.07), (-1.2, -D / 2 - 0.31, 0.93))
    # Barril de agua para templar, junto a la puerta.
    cylinder("timber", 0.17, 0.36, (-1.0, -D / 2 - 0.3, 0.18), verts=10)
