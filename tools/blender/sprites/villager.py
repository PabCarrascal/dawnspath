"""
Aldeano: el mismo personaje que drawVillager() de characters.ts, en 3D.

Proporciones achaparradas (unas 2,5 cabezas), como el héroe. Saya parda que
se abre en falda hasta media pierna, con un delantal crudo por delante y su
pretina más oscura; calzas grises y botas asomando debajo. Sombrero de paja
de ala ancha con cinta roja. En la mano del lado de la cámara, una cesta de
mimbre trenzado con una manzana roja y otra verde; cuelga siempre derecha.
El dibujado no tiene golpe propio: en el ataque solo se inclina hacia delante
y en el dolor hacia atrás, y así lo hace el modelo. Los colores son las
rampas (luz, base, sombra) de la paleta C y los tonos propios del dibujado.
"""

from math import cos, radians, sin

# Cuadro en la rejilla base, como el dibujado.
SIZE = (32, 40)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 40 filas del dibujado.
VIEW = SIZE[1] / 20
# Algo menos de giro que por defecto: la cesta queda delante del cuerpo, a la derecha.
TURN = 25

from palette import BOOTS, EYE, GOLD, GREEN, MOUTH, PANTS, RED, SKIN, WOOD

# Tonos propios del dibujado: la saya parda, el delantal crudo con su pretina y las manzanas (C.red[0], C.green[0]).
SAYA = (0xB08A5A, 0x8A6A40, 0x5E4628)
APRON = (0xF6F0DE, 0xE8E0C8, 0xD0C4A4)
BAND = (0xE0D6BA, 0xD0C4A4, 0xA89C7C)
APPLE_R = (0xF07A64, RED[0], RED[1])
APPLE_G = (0x7AB868, GREEN[0], GREEN[1])

HIPS = 0.38
# El delantal mira de frente a la cámara: así cae en medio del cuerpo, como en el dibujado.
APRON_YAW = -(90 - TURN) + 2


def build(rig):
    # Piernas cortas y botas que asoman hacia delante bajo la falda.
    for side in (-1, 1):
        rig.part("tube", "root", (0, 0.11 * side, 0.24), (0.16, 0.16, 0.3), PANTS)
        rig.part("box", "root", (0.03, 0.11 * side, 0.07), (0.26, 0.17, 0.14), BOOTS)

    rig.pivot("hips", (0, 0, HIPS))
    # Saya: cuerpo y falda que se abre hacia abajo.
    rig.part("tube", "hips", (0, 0, 0.34), (0.42, 0.5, 0.44), SAYA)
    rig.part("frustum", "hips", (0, 0, 0.09), (0.54, 0.62, 0.26), SAYA, taper=0.8)
    # Delantal por delante, en medio de lo que se ve del cuerpo (como en el dibujado), con su pretina.
    # Va en dos tramos, uno sobre la falda y otro sobre el cuerpo, pegados a cada uno.
    for z0, z1, r, taper, color in ((-0.04, 0.22, 0.33, 0.8, APRON), (0.22, 0.355, 0.265, 1, APRON), (0.355, 0.39, 0.27, 1, BAND)):
        rig.part("pleats", "hips", (0, 0, (z0 + z1) / 2), (2 * r, 2 * r, z1 - z0), color, rot=(0, 0, 180 + APRON_YAW), folds=8, taper=taper, depth=0, span=74)

    # Cabeza grande: la cara asoma bajo el ala del sombrero.
    rig.pivot("head", (0, 0, 0.8), "hips")
    rig.part("ball", "head", (0, 0, 0), (0.5, 0.5, 0.5), SKIN)
    # La cara mira algo hacia la cámara (yaw negativo), como en el dibujado.
    for yaw in (-10, -50):
        rig.part("box", "head", _on_face(yaw, 0.24, -0.05), (0.04, 0.045, 0.08), EYE, rot=(0, 0, yaw), mark="eye")
    rig.part("box", "head", _on_face(-30, 0.225, -0.16), (0.03, 0.06, 0.025), MOUTH, rot=(0, 0, -30))
    # Sombrero de paja: copa redondeada, cinta roja y ala ancha y plana.
    rig.part("ball", "head", (0, 0, 0.17), (0.52, 0.52, 0.4), GOLD)
    rig.part("tube", "head", (0, 0, 0.15), (0.535, 0.535, 0.06), RED)
    rig.part("tube", "head", (0, 0, 0.11), (0.84, 0.84, 0.04), GOLD)

    # Brazo de detrás, casi oculto por el cuerpo.
    rig.pivot("shoulder_l", (0, 0.27, 0.48), "hips")
    rig.part("tube", "shoulder_l", (0, 0, -0.14), (0.14, 0.14, 0.3), SAYA)
    rig.part("ball", "shoulder_l", (0, 0, -0.31), 0.12, SKIN)

    # Brazo de la cesta, del lado de la cámara.
    rig.pivot("shoulder_r", (0.05, -0.27, 0.48), "hips")
    rig.part("tube", "shoulder_r", (0, 0, -0.14), (0.14, 0.14, 0.3), SAYA)
    rig.part("ball", "shoulder_r", (0, 0, -0.31), 0.12, SKIN)

    # Cesta colgada del asa: mimbre trenzado, que se abre hacia la boca, y dos manzanas.
    rig.pivot("basket", (0, 0, -0.31), "shoulder_r")
    rig.part("frustum", "basket", (0.12, 0, -0.15), (0.36, 0.26, 0.18), WOOD, mark="mail", taper=1.2)
    rig.part("tube", "basket", (0.12, 0, -0.055), (0.44, 0.32, 0.035), WOOD)
    rig.part("ball", "basket", (0.04, 0.02, -0.04), 0.12, APPLE_R)
    rig.part("ball", "basket", (0.19, -0.02, -0.04), 0.11, APPLE_G)
    # Asa baja en arco, de un lado a otro de la boca, que pasa por la mano.
    n = 5
    for i in range(n):
        a = -80 + 160 * (i + 0.5) / n
        x, z = 0.12 + 0.2 * sin(radians(a)), -0.06 + 0.07 * cos(radians(a))
        rig.part("box", "basket", (x, 0, z), (0.03, 0.03, 0.08), WOOD, rot=(0, a, 0))


def _on_face(yaw, r, z):
    """Punto de la superficie de la cabeza, girado `yaw` grados desde el frente."""
    return (r * cos(radians(yaw)), r * sin(radians(yaw)), z)


def _hold(turns):
    """La cesta cuelga derecha: gira al revés que el cuerpo y el brazo."""
    turns["basket"] = -(turns.get("hips", 0) + turns.get("shoulder_r", 0))
    return turns


# Reposo (dos cuadros, el segundo un píxel base más bajo), golpe y dolor: el dibujado
# solo se inclina hacia delante en el golpe y hacia atrás en el dolor.
POSES = [
    (_hold({"shoulder_r": -40, "shoulder_l": 8}), {}),
    (_hold({"shoulder_r": -39, "shoulder_l": 8}), {"hips": -0.05}),
    (_hold({"hips": 8, "head": 4, "shoulder_r": -42, "shoulder_l": 4}), {}),
    (_hold({"hips": -12, "head": -14, "shoulder_r": -30, "shoulder_l": 25}), {}),
]


def pose(rig, f):
    rig.pose(*POSES[f])
