"""
Capellán: el mismo personaje que drawChaplain() de characters.ts, en 3D.

Proporciones achaparradas (unas 2,5 cabezas), como el héroe. Hábito blanco
largo hasta los pies que se abre hacia abajo, con una franja dorada bordada
por delante y las puntas de las botas asomando bajo el ruedo. Toca blanca que
cubre la cabeza y cae por detrás hasta los hombros, con ribete dorado en la
frente. En la mano del lado de la cámara, un farol encendido que cuelga
siempre derecho; al bendecir lo alza por encima de la cabeza. Los colores son
las rampas (luz, base, sombra) de la paleta C.
"""

from math import atan, cos, degrees, radians, sin

# Cuadro en la rejilla base: algo más ancho que los 32 del dibujado para que quepa el farol.
SIZE = (36, 40)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 40 filas del dibujado.
VIEW = 2.0
# Algo menos de giro que por defecto: al alzar el farol, el brazo no tapa los ojos.
TURN = 20

from palette import BOOTS, EYE, GOLD, MOUTH, SKIN, WHITE

# Hierro del farol (0x3a3a44 en el dibujado) y su luz.
IRON = (0x5A5A66, 0x3A3A44, 0x24242C)
GLOW = (0xFFF4B0, 0xFFD860, 0xD89A2A)
# Puntadas del bordado, más claras que la franja.
STITCH = (0xFFF6C0, 0xFFE08A, 0xD8A83A)

# Hábito: radio lateral (y) en el suelo y en los hombros; de frente es algo más estrecho.
HEM, HEM_Z = 0.45, 0.03
NECK, NECK_Z = 0.25, 0.93
DEPTH = 0.84
HIPS = 0.38
# La franja mira algo hacia la cámara, como la cara, para que caiga en medio del hábito.
STRIPE_YAW = -30


def _radius(z):
    return HEM + (NECK - HEM) * (z - HEM_Z) / (NECK_Z - HEM_Z)


def _frustum(rig, parent, z0, z1, color, base=0.0):
    """Tronco de cono del hábito entre las alturas z0 y z1 (absolutas); `base` es la altura del pivote."""
    r0, r1 = _radius(z0), _radius(z1)
    loc = (0, 0, (z0 + z1) / 2 - base)
    return rig.part("frustum", parent, loc, (2 * r0 * DEPTH, 2 * r0, z1 - z0), color, taper=r1 / r0)


def _on_robe(z, yaw, out=0.0):
    """Punto del frente del hábito a la altura z, girado `yaw` grados hacia la cámara."""
    r = _radius(z) + out
    return (r * DEPTH * cos(radians(yaw)), r * sin(radians(yaw)), z)


def _stripe(rig, parent, z0, z1, base=0.0):
    """Franja dorada por delante del hábito, siguiendo su inclinación, con puntadas más claras."""
    tilt = -degrees(atan((_radius(z0) - _radius(z1)) * DEPTH / (z1 - z0)))
    x, y, z = _on_robe((z0 + z1) / 2, STRIPE_YAW)
    rig.part("box", parent, (x, y, z - base), (0.04, 0.1, z1 - z0), GOLD, rot=(0, tilt, STRIPE_YAW))
    z = z0 + 0.06
    while z < z1 - 0.03:
        x, y, _ = _on_robe(z, STRIPE_YAW, 0.01)
        rig.part("box", parent, (x, y, z - base), (0.03, 0.05, 0.04), STITCH, rot=(0, tilt, STRIPE_YAW))
        z += 0.1


def build(rig):
    # Puntas de las botas bajo el ruedo.
    for side in (-1, 1):
        rig.part("box", "root", (0.38, 0.12 * side, 0.05), (0.2, 0.16, 0.1), BOOTS)
    # Faldón del hábito, quieto en el suelo; la mitad de arriba baja con el balanceo.
    _frustum(rig, "root", HEM_Z, 0.46, WHITE)
    _stripe(rig, "root", 0.12, 0.46)

    rig.pivot("hips", (0, 0, HIPS))
    _frustum(rig, "hips", HIPS, NECK_Z, WHITE, HIPS)
    _stripe(rig, "hips", HIPS + 0.03, NECK_Z - 0.03, HIPS)

    # Cabeza grande: la cara asoma bajo la toca.
    rig.pivot("head", (0, 0, 0.8), "hips")
    rig.part("ball", "head", (0, 0, 0), (0.5, 0.5, 0.5), SKIN)
    for yaw in (-16, -56):
        rig.part("box", "head", _on_face(yaw, 0.24, -0.05), (0.04, 0.045, 0.08), EYE, rot=(0, 0, yaw), mark="eye")
    rig.part("box", "head", _on_face(-36, 0.225, -0.16), (0.03, 0.06, 0.025), MOUTH, rot=(0, 0, -36))
    # Toca: gorro blanco, ribete dorado en la frente y paño que cae por detrás hasta los hombros.
    rig.part("ball", "head", (-0.02, 0, 0.15), (0.58, 0.57, 0.42), WHITE)
    rig.part("tube", "head", (0.0, 0, 0.07), (0.56, 0.58, 0.06), GOLD)
    rig.part("pleats", "head", (-0.03, 0, -0.17), (0.66, 0.68, 0.52), WHITE)

    # Brazo de detrás, casi oculto por el cuerpo.
    rig.pivot("shoulder_l", (0, 0.27, 0.48), "hips")
    rig.part("tube", "shoulder_l", (0, 0, -0.14), (0.15, 0.15, 0.3), WHITE)
    rig.part("ball", "shoulder_l", (0, 0, -0.31), 0.12, SKIN)

    # Brazo del farol, del lado de la cámara: manga ancha y mano.
    rig.pivot("shoulder_r", (0, -0.29, 0.48), "hips")
    rig.part("tube", "shoulder_r", (0, 0, -0.14), (0.16, 0.16, 0.3), WHITE)
    # El antebrazo va metido en la manga; al alzar el farol se desliza fuera y estira
    # el brazo, como hace el dibujado.
    rig.pivot("forearm", (0, 0, 0), "shoulder_r")
    rig.part("tube", "forearm", (0, 0, -0.15), (0.15, 0.15, 0.28), WHITE)
    rig.part("ball", "forearm", (0, 0, -0.31), 0.12, SKIN)

    # Farol: asa, chapas de hierro arriba y abajo y el vidrio encendido entre ellas.
    rig.pivot("lantern", (0, 0, -0.31), "forearm")
    rig.part("box", "lantern", (0, 0, -0.07), (0.025, 0.025, 0.12), IRON)
    rig.part("box", "lantern", (0, 0, -0.14), (0.2, 0.2, 0.04), IRON)
    rig.part("box", "lantern", (0, 0, -0.27), (0.16, 0.16, 0.22), GLOW, mark="glow")
    rig.part("box", "lantern", (0, 0, -0.4), (0.2, 0.2, 0.04), IRON)


def _on_face(yaw, r, z):
    """Punto de la superficie de la cabeza, girado `yaw` grados desde el frente."""
    return (r * cos(radians(yaw)), r * sin(radians(yaw)), z)


def _hold(turns, swing=0):
    """El farol cuelga derecho: gira al revés que el brazo (más `swing`)."""
    turns["lantern"] = -(turns.get("hips", 0) + turns.get("shoulder_r", 0)) + swing
    return turns


# Reposo (dos cuadros, el segundo un píxel base más bajo), bendición con el farol en alto y dolor.
POSES = [
    (_hold({"shoulder_r": -60, "shoulder_l": 8}), {}),
    (_hold({"shoulder_r": -58, "shoulder_l": 8}), {"hips": -0.05}),
    (_hold({"hips": 5, "head": 2, "shoulder_r": -188, "shoulder_l": -20}, 180), {"shoulder_r": 0.05, "forearm": -0.2}),
    (_hold({"hips": -12, "head": -14, "shoulder_r": -62, "shoulder_l": 25}, -20), {}),
]


def pose(rig, f):
    rig.pose(*POSES[f])
