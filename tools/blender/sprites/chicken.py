"""
Gallina: la misma que drawChicken() de characters.ts, en 3D.

Vida de fondo en las maquetas del castillo y la aldea. Cuerpo blanco
ovalado, cabeza redonda delante y arriba, cresta roja encima, pico dorado
de un píxel, ojo oscuro, la cola en penacho atrás (del tono de sombra del
blanco) y dos patas doradas que no se mueven. En reposo el cuerpo baja un
píxel en el segundo cuadro (las maquetas solo usan esos dos, a 3 por
segundo); en el golpe agacha la cabeza a picotear y en el dolor la echa
atrás y se encoge (inclinarse entera como el dibujado la sacaría del
cuadro). Los colores son los de la paleta C.
"""

# Cuadro en la rejilla base, como el dibujado.
SIZE = (14, 12)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 12 filas del dibujado.
VIEW = SIZE[1] / 20
# Poco giro: el dibujado es de perfil.
TURN = 20

from palette import GOLD, RED, WHITE

# La cola es el tono de sombra del blanco, con su propia sombra más honda.
TAIL = (WHITE[1], WHITE[2], 0x7A705E)
# El ojo, del mismo tono con cualquier luz: un píxel oscuro como el dibujado.
EYE = (0x1A1220, 0x1A1220, 0x1A1220)
# Centro del cuerpo: un píxel base a la izquierda del centro del cuadro (x = 6 sobre 14).
X0 = -0.05


def build(rig):
    # Patas: dos palitos dorados en x = 5 y 8 del dibujado, quietos en todos los cuadros.
    for x, y in ((-0.07, 0.04), (0.1, -0.04)):
        rig.part("box", "root", (X0 + x, y, 0.05), (0.05, 0.04, 0.12), GOLD)

    # Cuerpo: óvalo de 11 × 7 píxeles, colgado de la cadera para inclinarse.
    rig.pivot("body", (X0, 0, 0.08))
    rig.part("ball", "body", (0, 0, 0.15), (0.52, 0.3, 0.32), WHITE)
    # Cola: penacho que asoma por encima de la espalda (x = 1–2, y = 4–5).
    rig.part("box", "body", (-0.2, 0, 0.25), (0.11, 0.14, 0.12), TAIL, rot=(0, 25, 0))

    # Cabeza: bola de 5 píxeles delante y arriba, con cresta, pico y ojo.
    rig.pivot("head", (0.16, 0, 0.2), "body")
    rig.part("ball", "head", (0.04, 0, 0.07), 0.24, WHITE)
    rig.part("box", "head", (0.02, 0, 0.21), (0.1, 0.04, 0.07), RED)
    rig.part("cone", "head", (0.19, 0, 0.07), (0.07, 0.07, 0.09), GOLD, rot=(0, 90, 0))
    rig.part("box", "head", (0.07, -0.11, 0.08), (0.05, 0.02, 0.05), EYE)


# Reposo (dos cuadros, el segundo un píxel base más bajo), picotazo y dolor.
POSES = [
    ({}, {}),
    ({}, {"body": -0.05}),
    ({"body": 5, "head": 32}, {"body": -0.02}),
    ({"body": -2, "head": -28}, {"body": -0.02}),
]


def pose(rig, f):
    rig.pose(*POSES[f])
