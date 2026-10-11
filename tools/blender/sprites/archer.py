"""
Arquera: el mismo personaje que drawArcher() de characters.ts, en 3D.

Proporciones achaparradas (unas 2,5 cabezas), como el héroe. Capucha verde que
solo deja ver la cara (con un mechón de pelo bajo el borde) y cae por la espalda
hasta los hombros, capa verde larga con cinto y broche de oro, calzas de cuero,
botas y el carcaj a la espalda con las plumas asomando. El arco va en la mano de
detrás: en reposo, vertical delante del cuerpo con la cuerda hacia fuera; al
disparar, el brazo se estira al frente y la otra mano tensa la cuerda hasta
debajo de la barbilla, con la flecha montada y recta. Los colores son las rampas (luz, base, sombra)
de la paleta C.
"""

from math import asin, atan2, cos, degrees, hypot, radians, sin, tan

# Cuadro en la rejilla base: algo más ancho que los 32 del dibujado para que quepan el arco y la flecha.
SIZE = (36, 40)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 40 filas del dibujado.
VIEW = 2.0
# Poco giro, como el héroe: el arco queda delante y a un lado, sin tapar la cara.
TURN = 20

from palette import BOOTS, EYE, GOLD, GREEN, HAIR, LEATHER, MOUTH, RED, SKIN, STEEL, WHITE, WOOD

STRING = 0xE8E0D0

# Arco: medio alto, cuánto se curvan las palas hacia la cuerda y cuánto se tensa al disparar.
BOW_HALF = 0.52
BOW_SAG = 0.1
PULL = 0.14
# Cada media cuerda es tan larga que, al tensar, se inclina DRAW grados y se junta con la otra en la culata (NOCK).
STRING_LEN = hypot(BOW_HALF, PULL)
DRAW = degrees(atan2(PULL, BOW_HALF))
NOCK = -BOW_SAG - PULL
# Brazos: largo del brazo y antebrazo del que tensa, y dónde va el arco en la otra mano.
UPPER, FORE = 0.16, 0.15
GRIP = 0.4
# Distancia en profundidad entre la mano que tensa y el plano del arco.
HAND_GAP = 0.25


def build(rig):
    # Piernas cortas con calzas de cuero y botas que asoman hacia delante.
    for side in (-1, 1):
        rig.part("tube", "root", (0, 0.11 * side, 0.24), (0.16, 0.16, 0.3), LEATHER)
        rig.part("box", "root", (0.03, 0.11 * side, 0.07), (0.26, 0.17, 0.14), BOOTS)

    rig.pivot("hips", (0, 0, 0.38))
    # Carcaj a la espalda, algo echado hacia atrás, con su boca y las plumas de las flechas.
    tilt = -14
    for kind, d, dx, size, color in (
        ("tube", 0, 0, (0.2, 0.2, 0.6), LEATHER),
        ("tube", 0.28, 0, (0.22, 0.22, 0.05), BOOTS),
        ("box", 0.36, 0, (0.03, 0.03, 0.12), WOOD),
        ("box", 0.42, -0.05, (0.05, 0.06, 0.18), WHITE),
        ("box", 0.42, 0.04, (0.05, 0.06, 0.2), RED),
    ):
        x, y, z = _along((-0.3, -0.02, 0.45), tilt, d)
        rig.part(kind, "hips", (x + dx, y, z), size, color, rot=(0, tilt, 0))

    # Capa larga: cuerpo, faldón que se abre hacia abajo, cinto y broche.
    rig.part("tube", "hips", (0, 0, 0.34), (0.42, 0.5, 0.44), GREEN)
    rig.part("tube", "hips", (0, 0, 0.0), (0.5, 0.58, 0.3), GREEN)
    rig.part("tube", "hips", (0, 0, 0.24), (0.45, 0.53, 0.05), LEATHER)
    # Esclavina de la capucha sobre los hombros.
    rig.part("wedge", "hips", (-0.02, 0, 0.5), (0.5, 0.6, 0.14), GREEN)
    rig.part("ball", "hips", _on_face(-35, 0.24, 0.45), 0.08, GOLD)

    # Cabeza grande: la capucha la envuelve por arriba, por detrás y por los lados.
    rig.pivot("head", (0, 0, 0.8), "hips")
    rig.part("ball", "head", (0, 0, 0), (0.5, 0.5, 0.5), SKIN)
    # La cara mira algo hacia la cámara (yaw negativo), como en el dibujado.
    for yaw in (-8, -48):
        rig.part("box", "head", _on_face(yaw, 0.24, -0.05), (0.04, 0.045, 0.08), EYE, rot=(0, 0, yaw), mark="eye")
    rig.part("box", "head", _on_face(-28, 0.225, -0.16), (0.03, 0.06, 0.025), MOUTH, rot=(0, 0, -28))
    # Mechón de pelo bajo el borde de la capucha.
    rig.part("ball", "head", _on_face(-30, 0.2, 0.09), (0.12, 0.2, 0.09), HAIR, rot=(0, 0, -30))
    rig.part("ball", "head", (-0.04, 0, 0.22), (0.6, 0.6, 0.42), GREEN)
    rig.part("ball", "head", (-0.13, 0, -0.02), (0.4, 0.58, 0.56), GREEN)
    rig.part("box", "head", (-0.15, 0, -0.24), (0.2, 0.46, 0.3), GREEN, rot=(0, 8, 0))

    # Brazo de la cámara: el que tensa la cuerda, con codo.
    rig.pivot("shoulder_r", (0, -0.29, 0.48), "hips")
    rig.part("tube", "shoulder_r", (0, 0, -0.08), (0.14, 0.14, 0.18), GREEN)
    rig.pivot("elbow_r", (0, 0, -0.16), "shoulder_r")
    rig.part("tube", "elbow_r", (0, 0, -0.07), (0.13, 0.13, 0.15), GREEN)
    rig.part("ball", "elbow_r", (0, 0, -0.15), 0.13, SKIN)

    # Brazo de detrás, el que sostiene el arco.
    rig.pivot("shoulder_l", (0, 0.29, 0.48), "hips")
    # Algo metido hacia el centro, para que el arco quede delante del cuerpo y en línea con la otra mano.
    rig.part("tube", "shoulder_l", (0, -0.07, -0.16), (0.14, 0.14, 0.34), GREEN, rot=(-25, 0, 0))
    rig.part("ball", "shoulder_l", (0, -0.17, -0.36), 0.14, SKIN)

    # Arco: la empuñadura en la mano y las palas en arco, curvadas hacia la cuerda.
    rig.pivot("bow", (0, -0.33, -GRIP), "shoulder_l")
    r = (BOW_HALF**2 + BOW_SAG**2) / (2 * BOW_SAG)
    span = asin(BOW_HALF / r)
    n = 8
    for i in range(n):
        a = -span + 2 * span * (i + 0.5) / n
        rig.part("box", "bow", (-r + r * cos(a), 0, r * sin(a)), (0.06, 0.05, 2 * span * r / n * 1.12), WOOD, rot=(0, -degrees(a), 0))
    rig.part("box", "bow", (0.01, 0, 0), (0.08, 0.07, 0.14), LEATHER)
    # Cuerda en dos mitades, una desde cada punta: rectas se solapan; al tensar se juntan atrás.
    for name, z in (("string_t", BOW_HALF), ("string_b", -BOW_HALF)):
        rig.pivot(name, (-BOW_SAG, 0, z), "bow")
        rig.part("box", name, (0, 0, -STRING_LEN / 2 if z > 0 else STRING_LEN / 2), (0.032, 0.032, STRING_LEN), STRING)
    # Flecha montada, con la culata en la cuerda: solo se ve al disparar (en las demás poses
    # se aparta muy lejos del cuadro).
    rig.pivot("arrow", (NOCK, 0, 0), "bow")
    rig.part("box", "arrow", ((0.3 - NOCK) / 2, 0, 0), (0.3 - NOCK, 0.03, 0.035), WOOD)
    rig.part("cone", "arrow", (0.36 - NOCK, 0, 0), (0.07, 0.07, 0.13), STEEL, rot=(0, 90, 0))
    for z in (0.035, -0.035):
        rig.part("box", "arrow", (0.07, 0, z), (0.12, 0.03, 0.04), WHITE)


def _on_face(yaw, r, z):
    """Punto de la superficie de la cabeza, girado `yaw` grados desde el frente."""
    return (r * cos(radians(yaw)), r * sin(radians(yaw)), z)


def _along(base, tilt, d):
    """Punto a `d` unidades de `base` por el eje de una pieza vertical inclinada `tilt` grados."""
    return (base[0] + d * sin(radians(tilt)), base[1], base[2] + d * cos(radians(tilt)))


HIDE = {"arrow": 20}


def _turn(v, a):
    """Vector (x, z) girado `a` grados alrededor de Y, como los pivotes."""
    c, s = cos(radians(a)), sin(radians(a))
    return (v[0] * c + v[1] * s, -v[0] * s + v[1] * c)


def _draw_arm(hips, sl, bow):
    """Giros de hombro y codo del brazo que tensa para que la mano llegue a la culata de la flecha."""
    g = _turn((0, -GRIP), sl)
    n = _turn((NOCK, 0), bow - hips)
    # La mano está más cerca de la cámara que la cuerda: se adelanta lo justo para que en pantalla caigan juntas.
    tx, tz = g[0] + n[0] + tan(radians(TURN)) * HAND_GAP, g[1] + n[1]
    d = min(hypot(tx, tz), UPPER + FORE - 1e-3)
    a = (UPPER**2 - FORE**2 + d**2) / (2 * d)
    h = (UPPER**2 - a**2) ** 0.5
    # El codo cae por debajo de la línea hombro-mano.
    ux, uz = tx / d, tz / d
    ex, ez = a * ux + h * uz, a * uz - h * ux
    shoulder = degrees(atan2(-ex, -ez))
    fore = degrees(atan2(-(tx - ex), -(tz - ez)))
    return shoulder, fore - shoulder


def _pose(hips=0, head=0, sl=0, bow=None, sr=0, er=0, draw=0, lift=None):
    """Pose con el arco girado `bow` grados en el mundo (no sigue al cuerpo) y la cuerda tensada `draw` grados."""
    if draw:
        sr, er = _draw_arm(hips, sl, bow)
    turns = {"hips": hips, "head": head, "shoulder_l": sl, "bow": bow - hips - sl, "shoulder_r": sr, "elbow_r": er}
    # La flecha sale siempre recta al frente, aunque el arco vaya algo inclinado.
    turns.update({"string_t": draw, "string_b": -draw, "arrow": -bow})
    lift = dict(lift or {})
    if not draw:
        lift.update(HIDE)
    return turns, lift


# Reposo (dos cuadros, el segundo un píxel base más bajo), disparo y dolor.
# En reposo el arco va girado media vuelta: la cuerda mira hacia fuera, como en el dibujado.
POSES = [
    _pose(sl=-55, bow=180, sr=-8, er=-10),
    _pose(sl=-53, bow=180, sr=-8, er=-12, lift={"hips": -0.05}),
    # Brazo del arco estirado al frente; el otro, con el codo doblado, lleva la cuerda bajo la barbilla.
    _pose(hips=6, head=-4, sl=-96, bow=8, draw=DRAW),
    _pose(hips=-12, head=-14, sl=-30, bow=168, sr=25, er=-20),
]


def pose(rig, f):
    rig.pose(*POSES[f])
