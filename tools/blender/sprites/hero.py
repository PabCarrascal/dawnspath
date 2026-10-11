"""
Héroe del Alba: el mismo personaje que drawHero() de characters.ts, en 3D.

Proporciones achaparradas (unas 2,5 cabezas), yelmo con guardanuca y penacho,
túnica azul con cinto, hombrera, capa roja que ondea hacia atrás y la espada en
alto. Los colores son las rampas (luz, base, sombra) de la paleta C.
"""

from math import cos, radians, sin

# Cuadro en la rejilla base: algo más ancho que los 32 del dibujado para que quepa la estocada.
SIZE = (36, 40)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 40 filas del dibujado.
VIEW = 2.0
# Menos giro que por defecto: así la espada queda delante del cuerpo y no tapa la cara.
TURN = 20

from palette import BLUE, BOOTS, EYE, GOLD, LEATHER, MOUTH, PANTS, RED, SKIN, STEEL

GEM = (0xFF8A7A, 0xFF5A4A, 0xB02A2A)


def build(rig):
    # Piernas cortas y botas que asoman hacia delante.
    for side in (-1, 1):
        rig.part("tube", "root", (0, 0.11 * side, 0.24), (0.16, 0.16, 0.3), PANTS)
        rig.part("box", "root", (0.03, 0.11 * side, 0.07), (0.26, 0.17, 0.14), BOOTS)

    rig.pivot("hips", (0, 0, 0.38))
    # Capa: envuelve la espalda desde los hombros, se abre hacia abajo y hacia atrás, y forma pliegues.
    rig.part("pleats", "hips", (-0.03, 0, 0.13), (0.7, 0.74, 0.76), RED, rot=(0, -18, 0))
    # Túnica con cota de malla, faldón, cinto y hebilla.
    rig.part("tube", "hips", (0, 0, 0.34), (0.42, 0.5, 0.42), BLUE, mark="mail")
    rig.part("tube", "hips", (0, 0, 0.08), (0.46, 0.54, 0.16), BLUE)
    rig.part("tube", "hips", (0, 0, 0.17), (0.47, 0.55, 0.06), LEATHER)
    rig.part("box", "hips", (0.235, 0, 0.17), (0.03, 0.09, 0.07), GOLD)

    # Cabeza grande: la cara asoma bajo el borde del yelmo.
    rig.pivot("head", (0, 0, 0.8), "hips")
    rig.part("ball", "head", (0, 0, 0), (0.5, 0.5, 0.5), SKIN)
    # La cara mira algo hacia la cámara (yaw negativo), como en el dibujado.
    for yaw in (-8, -48):
        rig.part("box", "head", _on_face(yaw, 0.24, -0.05), (0.04, 0.045, 0.08), EYE, rot=(0, 0, yaw), mark="eye")
    rig.part("box", "head", _on_face(-28, 0.225, -0.16), (0.03, 0.06, 0.025), MOUTH, rot=(0, 0, -28))
    rig.part("ball", "head", (0, 0, 0.16), (0.56, 0.55, 0.4), STEEL)
    rig.part("tube", "head", (0, 0, 0.07), (0.58, 0.57, 0.07), STEEL)
    rig.part("box", "head", (-0.19, 0, -0.08), (0.1, 0.46, 0.3), STEEL)
    # Penacho: un mechón que se echa hacia atrás.
    rig.part("ball", "head", (-0.02, 0, 0.36), (0.2, 0.1, 0.22), RED, rot=(0, -20, 0))
    rig.part("ball", "head", (-0.1, 0, 0.4), (0.16, 0.08, 0.14), RED, rot=(0, -40, 0))

    # Brazo de detrás, casi oculto por el cuerpo.
    rig.pivot("shoulder_l", (0, 0.29, 0.48), "hips")
    rig.part("tube", "shoulder_l", (0, 0, -0.14), (0.14, 0.14, 0.3), BLUE)
    rig.part("ball", "shoulder_l", (0, 0, -0.31), 0.13, SKIN)

    # Brazo de la espada, del lado de la cámara, con su hombrera.
    rig.pivot("shoulder_r", (0, -0.29, 0.48), "hips")
    rig.part("tube", "shoulder_r", (0, 0, -0.14), (0.14, 0.14, 0.3), BLUE)
    rig.part("ball", "shoulder_r", (0, 0, -0.31), 0.13, SKIN)
    rig.part("ball", "shoulder_r", (0, 0, 0.0), (0.26, 0.24, 0.17), STEEL)

    # Espada: empuñadura, gavilán con gema, hoja larga y pomo.
    rig.pivot("sword", (0, -0.03, -0.31), "shoulder_r")
    rig.part("box", "sword", (0, 0, 0), (0.045, 0.045, 0.12), LEATHER)
    rig.part("ball", "sword", (0, 0, -0.08), 0.065, GOLD)
    rig.part("box", "sword", (0, 0, 0.08), (0.06, 0.28, 0.05), GOLD)
    rig.part("ball", "sword", (0, -0.02, 0.08), 0.07, GEM)
    rig.part("box", "sword", (0, 0, 0.47), (0.085, 0.025, 0.74), STEEL)


def _on_face(yaw, r, z):
    """Punto de la superficie de la cabeza, girado `yaw` grados desde el frente."""
    return (r * cos(radians(yaw)), r * sin(radians(yaw)), z)


# Reposo (dos cuadros, el segundo un píxel base más bajo), estocada y dolor.
POSES = [
    ({"shoulder_r": -72, "sword": 82, "shoulder_l": 8}, {}),
    ({"shoulder_r": -70, "sword": 80, "shoulder_l": 8}, {"hips": -0.05}),
    ({"hips": 10, "head": 4, "shoulder_r": -92, "sword": 172, "shoulder_l": -15}, {}),
    ({"hips": -12, "head": -14, "shoulder_r": 20, "sword": 30, "shoulder_l": 25}, {}),
]


def pose(rig, f):
    rig.pose(*POSES[f])
