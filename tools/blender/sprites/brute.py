"""
Bruto: la misma criatura que drawBrute() de characters.ts, en 3D.

Un corpachón encorvado de piel parda y morada, casi una bola, con la panza más
clara por delante y pelaje a trazos oscuros. Patas cortas y gruesas con pezuñas
negras. La cabeza va hundida entre los hombros y adelantada, con dos cuernos de
hueso anillados que se abren en V, ojos naranjas encendidos y una boca negra con
un colmillo. En el brazo del lado de la cámara lleva un garrote con púas de
hueso, en alto y algo inclinado hacia delante; en el garrotazo el brazo se
estira y el garrote baja hasta golpear el suelo por delante. Los colores son los
del dibujado, en rampas (luz, base, sombra).
"""

from math import asin, atan2, cos, degrees, radians, sin, sqrt

# Cuadro en la rejilla base: el de dibujado (48 × 48); más ancho para que quepa el garrotazo.
SIZE = (56, 48)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 48 filas del dibujado.
VIEW = SIZE[1] / 20
# Poco giro: de perfil casi, como el dibujado, con el brazo y el garrote por delante del cuerpo.
TURN = 20

from palette import WOOD

# Tonos del dibujado: piel (hide), panza, pezuñas y boca (0x1e1218), hueso de cuernos,
# colmillo y púas (0xe8dcc0), anillas de los cuernos (0xa89c80), ojos (0xff8a22 con brillo 0xffe0a0)
# y trazos del pelaje (0x3a2432).
HIDE = (0x6A4A5A, 0x4A3040, 0x2E1C28)
# El brazo y el puño, algo más claros que el cuerpo para que se lean por delante de él
# (el dibujado los separa con su columna de luz y el puño en hide[0]).
LIMB = (0x8A6878, 0x64465A, 0x3A2434)
FIST = (0x9A7888, 0x7A5868, 0x4A3040)
BELLY = (0x8A6A6A, 0x6A4E50, 0x4E3638)
FUR = (0x4A3040, 0x3A2432, 0x2E1C28)
HOOF = (0x3A2830, 0x1E1218, 0x140A10)
BONE = (0xF6EEDA, 0xE8DCC0, 0xD0C4A8)
RING = (0xC0B498, 0xA89C80, 0x7A705C)
EMBER = (0xFFE0A0, 0xFF8A22, 0xD86A10)

# Todo el modelo, algo atrasado: el garrote, por delante, necesita más sitio que la espalda.
X0 = -0.1
# Cuerpo: centro (sobre el pivote de la cadera) y semiejes del elipsoide.
BODY = (-0.05, 0, 0.55)
BODY_R = (0.75, 0.66, 0.65)
# Cabeza: centro (sobre la cadera) y semiejes.
HEAD = (0.55, -0.05, 1.1)
HEAD_R = (0.35, 0.36, 0.3)
# Largo del brazo y del garrote.
ARM = 0.5
CLUB = 1.2


def _aim(d):
    """Giro (grados, XYZ) que lleva el eje Z de una pieza a la dirección `d`."""
    n = sqrt(sum(v * v for v in d))
    return (degrees(asin(-d[1] / n)), degrees(atan2(d[0], d[2])), 0)


def _along(base, d, t):
    """Punto a una fracción `t` del segmento que sale de `base` en la dirección `d`."""
    return tuple(b + v * t for b, v in zip(base, d))


def _horn(rig, base, d):
    """Cuerno de hueso de `base` hacia `d`, con anillas cada vez más estrechas."""
    n = sqrt(sum(v * v for v in d))
    rot = _aim(d)
    rig.part("frustum", "head", _along(base, d, 0.5), (0.12, 0.12, n), BONE, rot=rot, taper=0.35)
    for t in (0.2, 0.42, 0.64, 0.86):
        r = 0.12 * (1 - 0.65 * t) + 0.02
        rig.part("tube", "head", _along(base, d, t), (r, r, 0.035), RING, rot=rot)


def _on_head(yaw, z, out=0.0):
    """Punto de la superficie de la cabeza, girado `yaw` grados desde el frente, a la altura z."""
    k = sqrt(max(0.0, 1 - (z / HEAD_R[2]) ** 2))
    return (
        HEAD[0] + (HEAD_R[0] * k + out) * cos(radians(yaw)),
        HEAD[1] + (HEAD_R[1] * k + out) * sin(radians(yaw)),
        HEAD[2] + z,
    )


def _on_body(yaw, lat):
    """Punto de la superficie del cuerpo: `yaw` grados desde el frente y `lat` sobre el ecuador."""
    a, b = radians(yaw), radians(lat)
    return (
        BODY[0] + BODY_R[0] * cos(b) * cos(a),
        BODY[1] + BODY_R[1] * cos(b) * sin(a),
        BODY[2] + BODY_R[2] * sin(b),
    )


def build(rig):
    # Patas cortas y gruesas, una adelantada y otra atrasada, con pezuñas negras.
    for x, y in ((X0 - 0.2, -0.24), (X0 + 0.14, 0.24)):
        rig.part("tube", "root", (x, y, 0.3), (0.34, 0.34, 0.5), HIDE)
        rig.part("box", "root", (x + 0.03, y, 0.05), (0.44, 0.38, 0.1), HOOF)

    # Corpachón encorvado y la panza clara asomando por delante.
    rig.pivot("hips", (X0, 0, 0.45))
    rig.part("ball", "hips", BODY, tuple(2 * r for r in BODY_R), HIDE)
    # La panza es un óvalo aplastado que mira a la cámara, medio hundido en el cuerpo.
    rig.part("ball", "hips", (0.3, -0.45, 0.46), (0.36, 0.72, 0.66), BELLY, rot=(0, 0, TURN - 90))
    # Pelaje: trazos oscuros sueltos por la cara del cuerpo que mira a la cámara.
    for i in range(26):
        h = (i * 73 + 151) % 17
        yaw = -150 + (i * 47) % 170
        lat = -35 + ((i * 29 + h * 7) % 95)
        x, y, z = _on_body(yaw, lat)
        rig.part("box", "hips", (x, y, z), (0.03, 0.03, 0.09), FUR, rot=(0, -lat * 0.5, yaw))

    # Cabeza hundida entre los hombros y adelantada.
    rig.pivot("head", HEAD, "hips")
    hx, hy, hz = HEAD
    rig.part("ball", "head", (0, 0, 0), tuple(2 * r for r in HEAD_R), HIDE)
    # Ojos naranjas mirando a la derecha, boca negra y un colmillo.
    for yaw in (-8, -48):
        x, y, z = _on_head(yaw, 0.02)
        rig.part("box", "head", (x - hx, y - hy, z - hz), (0.06, 0.1, 0.1), EMBER, rot=(0, 0, yaw))
    x, y, z = _on_head(-26, -0.14)
    rig.part("box", "head", (x - hx, y - hy, z - hz), (0.06, 0.26, 0.05), HOOF, rot=(0, 0, -26))
    x, y, z = _on_head(-38, -0.19, -0.01)
    rig.part("box", "head", (x - hx, y - hy, z - hz), (0.04, 0.05, 0.07), BONE, rot=(0, 0, -38))
    # Cuernos que se abren en V: el de la cámara hacia atrás, el otro hacia delante.
    _horn(rig, (-0.05, -0.22, 0.17), (-0.1, -0.26, 0.5))
    _horn(rig, (0.08, 0.22, 0.17), (0.14, 0.26, 0.5))

    # Brazo grueso del lado de la cámara, colgando por delante del cuerpo.
    # "reach" no gira nada en reposo: en el garrotazo, girado y con "arm" alzado sobre él,
    # baja el hombro y lo echa atrás.
    rig.pivot("reach", (0.75, -0.55, 0.85), "hips")
    rig.pivot("arm", (0, 0, 0), "reach")
    rig.part("ball", "arm", (0, 0, 0), (0.34, 0.34, 0.3), LIMB)
    # El antebrazo y el puño se deslizan hacia el hombro para acortar el brazo en el garrotazo.
    rig.pivot("fore", (0, 0, 0), "arm")
    rig.part("tube", "fore", (0, 0, -ARM / 2), (0.26, 0.26, ARM), LIMB)
    rig.part("ball", "fore", (0, 0, -ARM), (0.28, 0.28, 0.22), FIST)

    # Garrote: mango de madera, cabeza abultada y púas de hueso. "club" lo orienta desde
    # el puño y "shaft" lo desliza a lo largo de su eje (en el garrotazo lo empuña más corto).
    # El mango pasa por detrás del puño (del lado de lejos), algo adelantado: así no tapa la cara.
    rig.pivot("club", (0.08, 0.08, -ARM), "fore")
    rig.pivot("shaft", (0, 0, 0), "club")
    rig.part("tube", "shaft", (0, 0, CLUB / 2 - 0.05), (0.13, 0.13, CLUB), WOOD)
    rig.part("ball", "shaft", (0, 0, CLUB - 0.1), (0.34, 0.34, 0.52), WOOD)
    spikes = ((-0.8, -0.3, 0.6), (1, -0.1, 0.25), (-0.15, -0.2, 1), (0.9, -0.3, -0.45), (0.2, -1, 0.3), (-1, -0.2, -0.3), (0.5, -0.8, -0.6))
    for d in spikes:
        n = sqrt(sum(v * v for v in d))
        u = tuple(v / n for v in d)
        p = (u[0] * 0.17, u[1] * 0.17, CLUB - 0.1 + u[2] * 0.26)
        rig.part("cone", "shaft", p, (0.09, 0.09, 0.2), BONE, rot=_aim(u))


def _strike(hips=8, arm=-72, club=142, drop=(-0.2, -0.3)):
    """
    Garrotazo: el hombro baja y se echa atrás `drop` (x, z), el brazo se acorta y el brazo y el
    garrote quedan a esos grados respecto al suelo; el garrote, empuñado más corto, llega al suelo
    por delante sin salirse del cuadro.
    """
    reach = degrees(atan2(drop[0], drop[1]))
    turns = {"hips": hips, "head": 6, "reach": reach, "arm": arm - hips - reach, "club": club - arm}
    return turns, {"arm": sqrt(drop[0] ** 2 + drop[1] ** 2), "fore": 0.1, "shaft": -0.45}


# Reposo (dos cuadros, el segundo un píxel base más bajo), garrotazo y dolor (echado atrás).
# En reposo el garrote se inclina (cadera + brazo + garrote) unos 16° hacia delante; en el
# garrotazo el brazo baja y se estira, y el garrote cae hasta el suelo por delante, empuñado más corto.
POSES = [
    ({"arm": -18, "club": 34}, {}),
    ({"arm": -18, "club": 34}, {"hips": -0.05}),
    _strike(),
    ({"hips": -9, "head": 3, "arm": -12, "club": 32}, {}),
]


def pose(rig, f):
    rig.pose(*POSES[f])
