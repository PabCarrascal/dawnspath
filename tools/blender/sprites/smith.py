"""
Herrero: el mismo personaje que drawSmith() de characters.ts, en 3D.

Proporciones achaparradas (unas 2,5 cabezas), como el héroe. Pelo corto
castaño oscuro que cubre la coronilla y la nuca, y barba cerrada que tapa
el mentón, con la boca asomando. Camisa de lienzo crudo remangada y un
mandil de cuero que cuelga por delante desde el pecho hasta los muslos;
calzas y botas como el resto. Con la mano del lado de la cámara sujeta el
martillo derecho, con el mango junto a la cara y la cabeza de acero a la
altura de la frente, sin taparle los ojos. Como en el dibujado, el golpe y el
dolor no cambian la pose: solo inclinan el cuerpo hacia delante o hacia
atrás. Los colores son las rampas (luz, base, sombra) de la paleta C y los
tonos propios del dibujado.
"""

from math import asin, atan2, cos, degrees, radians, sin

# Cuadro en la rejilla base, el mismo que el dibujado: el martillo cabe sin ensancharlo.
SIZE = (32, 40)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 40 filas del dibujado.
VIEW = SIZE[1] / 20
# Poco giro, como el héroe: el martillo queda junto a la cara y no delante de ella.
TURN = 20

from palette import BOOTS, EYE, LEATHER, MOUTH, PANTS, SKIN, STEEL, WOOD

# Tonos propios del dibujado: camisa de lienzo crudo y pelo y barba castaño oscuro.
SHIRT = (0xE8DCC0, 0xC8B898, 0x8A7A5A)
HAIR = (0x5A3A2A, 0x3E2618, 0x2A1810)

# Dónde sujeta la mano el martillo, desde el hombro de la cámara (adelantada y hacia el centro,
# para que el mango quede justo a la derecha de la cara), y el codo, pegado al costado.
HAND = (0.4, 0.19, -0.17)
ELBOW = (0.14, -0.02, -0.18)
# Alto del mango desde la mano hasta la cabeza del martillo.
HAFT = 0.66
# El mandil se gira hacia la cámara para que, como en el dibujado, tape casi todo el frente.
APRON_YAW = 155


def build(rig):
    # Piernas cortas y botas que asoman hacia delante.
    for side in (-1, 1):
        rig.part("tube", "root", (0, 0.11 * side, 0.24), (0.16, 0.16, 0.3), PANTS)
        rig.part("box", "root", (0.03, 0.11 * side, 0.07), (0.26, 0.17, 0.14), BOOTS)

    rig.pivot("hips", (0, 0, 0.38))
    # Camisa con su faldón.
    rig.part("tube", "hips", (0, 0, 0.34), (0.42, 0.5, 0.42), SHIRT)
    rig.part("tube", "hips", (0, 0, 0.08), (0.46, 0.54, 0.16), SHIRT)
    # Mandil de cuero: un paño curvo por delante, del pecho a los muslos, algo más bajo que la camisa.
    rig.part("pleats", "hips", (0, 0, 0.2), (0.52, 0.58, 0.5), LEATHER, rot=(0, 0, APRON_YAW), folds=8, taper=1, depth=0.04, span=150)
    # Cinta del mandil alrededor del cuello.
    rig.part("tube", "hips", (0.02, 0, 0.5), (0.36, 0.42, 0.04), LEATHER)

    # Cabeza grande con pelo corto, patillas y barba.
    rig.pivot("head", (0, 0, 0.8), "hips")
    rig.part("ball", "head", (0, 0, 0), (0.5, 0.5, 0.5), SKIN)
    # La cara mira algo hacia la cámara (yaw negativo), como en el dibujado.
    for yaw in (-8, -48):
        rig.part("box", "head", _on_face(yaw, 0.24, -0.04), (0.04, 0.045, 0.08), EYE, rot=(0, 0, yaw), mark="eye")
    # Pelo: casquete en la coronilla y la nuca.
    rig.part("ball", "head", (-0.02, 0, 0.12), (0.54, 0.54, 0.36), HAIR)
    rig.part("ball", "head", (-0.12, 0, 0.05), (0.3, 0.53, 0.34), HAIR)
    # Barba cerrada en mentón y quijada, con la boca asomando.
    rig.part("ball", "head", (0.13, -0.04, -0.17), (0.26, 0.36, 0.18), HAIR)
    rig.part("box", "head", _on_face(-26, 0.28, -0.12), (0.03, 0.08, 0.025), MOUTH, rot=(0, 0, -28))

    # Brazo de detrás, casi oculto por el cuerpo: manga remangada y antebrazo desnudo.
    rig.pivot("shoulder_l", (0, 0.27, 0.48), "hips")
    rig.part("tube", "shoulder_l", (0, 0, -0.07), (0.15, 0.15, 0.14), SHIRT)
    rig.part("tube", "shoulder_l", (0, 0, -0.2), (0.13, 0.13, 0.16), SKIN)
    rig.part("ball", "shoulder_l", (0, 0, -0.3), 0.13, SKIN)

    # Brazo del martillo, del lado de la cámara: codo pegado al costado y antebrazo hacia delante.
    rig.pivot("shoulder_r", (0, -0.27, 0.48), "hips")
    mid = tuple(e * 0.45 for e in ELBOW)
    _limb(rig, "shoulder_r", (0, 0, 0), mid, 0.15, SHIRT)
    _limb(rig, "shoulder_r", mid, ELBOW, 0.13, SKIN)
    rig.part("ball", "shoulder_r", ELBOW, 0.13, SKIN)
    _limb(rig, "shoulder_r", ELBOW, HAND, 0.11, SKIN)
    rig.part("ball", "shoulder_r", HAND, 0.13, SKIN)

    # Martillo: mango derecho desde la mano y cabeza de acero con la boca hacia delante.
    rig.pivot("hammer", HAND, "shoulder_r")
    rig.part("tube", "hammer", (0, 0, (HAFT - 0.1) / 2), (0.05, 0.05, HAFT + 0.1), WOOD)
    rig.part("box", "hammer", (0, 0, HAFT), (0.22, 0.1, 0.11), STEEL)
    rig.part("box", "hammer", (0.11, 0, HAFT), (0.05, 0.13, 0.14), STEEL)


def _on_face(yaw, r, z):
    """Punto de la superficie de la cabeza, girado `yaw` grados desde el frente."""
    return (r * cos(radians(yaw)), r * sin(radians(yaw)), z)


def _limb(rig, parent, a, b, r, color):
    """Tubo de grosor `r` que va del punto `a` al punto `b`."""
    d = [q - p for p, q in zip(a, b)]
    n = sum(v * v for v in d) ** 0.5
    dx, dy, dz = (v / n for v in d)
    rot = (-degrees(asin(dy)), degrees(atan2(dx, dz)), 0)
    rig.part("tube", parent, tuple((p + q) / 2 for p, q in zip(a, b)), (r, r, n), color, rot=rot)


# Reposo (dos cuadros, el segundo un píxel base más bajo), golpe y dolor.
# Como en el dibujado, el golpe solo carga el peso hacia delante y el dolor lo echa hacia atrás
# (con el martillo enderezado y algo adelantado para que el mango no le tape el ojo).
POSES = [
    ({}, {}),
    ({}, {"hips": -0.05}),
    ({"hips": 6, "head": 2}, {}),
    ({"hips": -8, "head": -3, "shoulder_r": -10, "hammer": 22}, {}),
]


def pose(rig, f):
    rig.pose(*POSES[f])
