"""
Lancero: el mismo personaje que drawSpearman() de characters.ts, en 3D.

Proporciones achaparradas (unas 2,5 cabezas), capacete de ala ancha, barba
oscura, jubón de cuero con peto de acero remachado y cinto, escudo redondo rojo
con umbo y remaches dorados en el brazo de delante y la lanza, más alta que él,
en la mano de detrás. En la acometida la lanza baja en ristre y se desliza hacia
delante. Los colores son las rampas (luz, base, sombra) de la paleta C.
"""

from math import cos, radians, sin

# Cuadro en la rejilla base: más ancho que los 32 del dibujado para que quepa la lanza en ristre.
SIZE = (40, 40)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 40 filas del dibujado.
VIEW = 2.0
# Giro hacia la cámara: el escudo queda a la izquierda del cuerpo y la lanza a la derecha.
TURN = 30

from palette import BOOTS, EYE, GOLD, HAIR, LEATHER, PANTS, RED, SKIN, STEEL, WOOD

# Tonos propios del dibujado: cinto (leather[2]), barba (hair[2] con hebras más oscuras) y remaches.
BELT = (LEATHER[1], LEATHER[2], 0x3A2410)
BEARD = (HAIR[1], HAIR[2], 0x4A2A10)
RIVET = (STEEL[2], 0x5A6474, 0x3E4656)


def build(rig):
    # Piernas cortas y botas que asoman hacia delante.
    for side in (-1, 1):
        rig.part("tube", "root", (0, 0.11 * side, 0.24), (0.16, 0.16, 0.3), PANTS)
        rig.part("box", "root", (0.03, 0.11 * side, 0.07), (0.26, 0.17, 0.14), BOOTS)

    rig.pivot("hips", (0, 0, 0.38))
    # Jubón de cuero con faldón y cinto oscuro.
    rig.part("tube", "hips", (0, 0, 0.34), (0.42, 0.5, 0.42), LEATHER)
    rig.part("tube", "hips", (0, 0, 0.08), (0.46, 0.54, 0.16), LEATHER)
    rig.part("tube", "hips", (0, 0, 0.17), (0.47, 0.55, 0.06), BELT)
    # Peto de acero sobre el pecho, con dos remaches.
    rig.part("ball", "hips", (0.02, -0.01, 0.43), (0.5, 0.58, 0.36), STEEL)
    for yaw in (-5, -40):
        a = radians(yaw)
        rig.part("ball", "hips", (0.255 * cos(a), 0.29 * sin(a), 0.44), 0.035, RIVET)

    # Cabeza grande: la cara asoma bajo el ala del capacete.
    rig.pivot("head", (0, 0, 0.8), "hips")
    rig.part("ball", "head", (0, 0, 0), (0.5, 0.5, 0.5), SKIN)
    # La cara mira algo hacia la cámara (yaw negativo), como en el dibujado.
    for yaw in (-12, -50):
        rig.part("box", "head", _on_face(yaw, 0.24, -0.04), (0.04, 0.045, 0.08), EYE, rot=(0, 0, yaw), mark="eye")
    # Barba que cubre mentón y quijada, sin boca a la vista.
    rig.part("ball", "head", (0.1, -0.03, -0.17), (0.32, 0.4, 0.2), BEARD)
    # Capacete: copa redonda y ala ancha y plana.
    rig.part("ball", "head", (0, 0, 0.2), (0.52, 0.52, 0.38), STEEL)
    rig.part("tube", "head", (0, 0, 0.1), (0.8, 0.8, 0.04), STEEL)

    # Brazo de delante con el escudo redondo: umbo en el centro y anillo de remaches.
    rig.pivot("shoulder_r", (0, -0.27, 0.48), "hips")
    rig.part("tube", "shoulder_r", (0, 0, -0.14), (0.14, 0.14, 0.3), LEATHER)
    rig.part("ball", "shoulder_r", (0, 0, -0.31), 0.13, SKIN)
    rig.pivot("shield", (-0.04, -0.12, -0.24), "shoulder_r")
    rig.part("ball", "shield", (0, 0, 0), (0.54, 0.12, 0.54), RED, rot=(0, 0, -8))
    rig.part("ball", "shield", (0, -0.065, 0), 0.07, GOLD)
    for k in range(8):
        a = radians(k * 45)
        rig.part("ball", "shield", (0.2 * cos(a), -0.045, 0.2 * sin(a)), 0.035, GOLD)

    # Brazo de detrás, adelantado para sujetar la lanza.
    rig.pivot("shoulder_l", (0, 0.27, 0.48), "hips")
    rig.part("tube", "shoulder_l", (0, 0, -0.14), (0.14, 0.14, 0.3), LEATHER)
    rig.part("ball", "shoulder_l", (0, 0, -0.31), 0.13, SKIN)

    # Lanza: "spear" la orienta desde la mano y "shaft" la desliza a lo largo de su eje.
    rig.pivot("spear", (0, 0, -0.31), "shoulder_l")
    rig.pivot("shaft", (0, 0, 0), "spear")
    rig.part("tube", "shaft", (0, 0, 0.215), (0.075, 0.075, 1.67), WOOD)
    rig.part("tube", "shaft", (0, 0, 1.07), (0.09, 0.09, 0.06), STEEL)
    rig.part("cone", "shaft", (0, 0, 1.21), (0.16, 0.06, 0.25), STEEL)


def _on_face(yaw, r, z):
    """Punto de la superficie de la cabeza, girado `yaw` grados desde el frente."""
    return (r * cos(radians(yaw)), r * sin(radians(yaw)), z)


# Reposo (dos cuadros, el segundo un píxel base más bajo), acometida y dolor.
# En la acometida la lanza queda a 82° y no a 90°: la punta, más cerca de la
# cámara que mira desde arriba, parecería caer. "shaft" la desliza hacia atrás
# para que la punta quepa en el cuadro; en el dolor, un poco, para no tocar el borde de arriba.
POSES = [
    ({"shoulder_l": -45, "spear": 45, "shoulder_r": 6}, {}),
    ({"shoulder_l": -44, "spear": 44, "shoulder_r": 6}, {"hips": -0.05}),
    ({"hips": 10, "head": -6, "shoulder_l": -50, "spear": 122, "shoulder_r": -10}, {"shaft": -0.75}),
    ({"hips": -12, "head": -6, "shoulder_l": -40, "spear": 50, "shoulder_r": 25}, {"shaft": -0.1}),
]


def pose(rig, f):
    rig.pose(*POSES[f])
