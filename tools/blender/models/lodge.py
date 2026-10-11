"""
Logia de constructores: casa de tablas sobre un zócalo de piedra, con troncos en
las esquinas, tejado de paja grueso, puerta ancha para sacar la madera y una
polea en el hastial. El andamio lo pone el juego al lado. Planta de 2,6 × 1,8.
"""

from modeling import box, cylinder, gable, reset

W, D, H = 2.6, 1.8, 1.5


def build():
    reset()
    box("stone", (W + 0.1, D + 0.1, 0.25), (0, 0, 0.125))
    box("planks", (W, D, H - 0.25), (0, 0, 0.25 + (H - 0.25) / 2))
    # Troncos en las esquinas y una viga a media altura.
    for sx in (-1, 1):
        for sy in (-1, 1):
            cylinder("timber", 0.1, H, (sx * W / 2, sy * D / 2, H / 2), verts=7)
    box("timber", (W + 0.1, 0.08, 0.09), (0, -D / 2 - 0.03, H - 0.05))
    # Tejado de paja: grueso y bajando mucho.
    gable("thatch", W + 0.5, D + 0.8, 1.2, H - 0.1, thick=0.22)
    # Puerta ancha de dos hojas y ventana.
    for x in (-0.62, -0.18):
        box("planks", (0.42, 0.06, 1.05), (x, -D / 2 - 0.03, 0.25 + 0.52))
    box("timber", (0.95, 0.07, 0.1), (-0.4, -D / 2 - 0.04, 1.33))
    box("window", (0.3, 0.05, 0.3), (0.75, -D / 2 - 0.02, 0.95))
    box("timber", (0.4, 0.07, 0.06), (0.75, -D / 2 - 0.04, 0.78))
    # Polea del hastial para subir cargas.
    box("timber", (0.1, 0.7, 0.1), (-W / 2 - 0.2, -0.25, H + 0.35))
    cylinder("iron", 0.09, 0.06, (-W / 2 - 0.2, -0.58, H + 0.3), verts=10, rot=(0, 90, 0))
    box("iron", (0.02, 0.02, 0.7), (-W / 2 - 0.2, -0.62, H - 0.05))
    # Troncos apilados contra la pared.
    for k, z in enumerate((0.12, 0.12, 0.33)):
        cylinder("planks", 0.11, 0.9, (-1.0 + k * 0.23 - (0.12 if k == 2 else 0), -D / 2 - 0.22, z), verts=8, rot=(0, 90, 0))
