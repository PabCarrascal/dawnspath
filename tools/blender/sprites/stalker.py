"""
Acechador: la misma criatura que drawStalker() de characters.ts, en 3D.

Cuerpo de caparazón morado, ovalado y alargado, con cuatro segmentos marcados
por surcos oscuros, y la cabeza redonda pegada por delante. Ojos en racimo
(cuatro puntos lilas, uno con brillo blanco) y un palpo claro que cae hacia
delante. Cuatro patas largas y finas, casi negras, con la rodilla asomando por
encima del lomo. Aguijón articulado que se curva hacia arriba por detrás y
acaba en una punta lila; al picar se estira, pasa por encima del lomo y cae
por delante de la cabeza (como en el dibujado, donde el aguijón del golpe es
más largo que el de reposo). Las patas quedan en el plano medio, por detrás
del cuerpo como en el dibujado, y siguen apoyadas en el suelo cuando el cuerpo
se mueve. Los colores son rampas (luz, base, sombra) sacadas del dibujado.
"""

from math import atan2, cos, degrees, hypot, radians, sin

# Cuadro en la rejilla base: algo más ancho que los 44 del dibujado para que quepa el picotazo.
SIZE = (48, 34)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 34 filas del dibujado.
VIEW = SIZE[1] / 20
# Casi de perfil: la criatura es larga y así se ven separadas las cuatro patas.
TURN = 15

# Caparazón (shell del dibujado), su tono oscuro para surcos y punta de la cola,
# patas (0x1e1028), ojos (0xd080ff y el brillo blanco), punta del aguijón (0xc080ff)
# y palpo (0xa08cc0).
SHELL = (0x6A3A8A, 0x4A2464, 0x2A123C)
DARK = (0x4A2464, 0x2A123C, 0x1C0A28)
LEG = (0x3A2448, 0x1E1028, 0x12081A)
EYE = (0xF4D8FF, 0xD080FF, 0xA858D8)
SPARK = (0xFFFFFF, 0xFFFFFF, 0xE8C8FF)
STING = (0xE8C8FF, 0xC080FF, 0x8A50C0)
PALP = (0xC8B8E0, 0xA08CC0, 0x6A5A88)


def _at(x, y):
    """Punto (x, z) del modelo que cae en (x, y) del dibujado (rejilla base, y hacia abajo)."""
    return ((x - 22) / 20 / cos(radians(TURN)), (33.5 - y) / 20)


# Cuerpo y cabeza: los blob() del dibujado, (centro, semiejes x, y, z).
BODY = (_at(18.5, 17.5), 0.54, 0.3, 0.33)
HEAD = (_at(31.5, 15.5), 0.33, 0.27, 0.28)
NECK = _at(26, 16.5)
# Surcos del caparazón: columnas de DETAIL.stalker.
SEAMS = [13.25, 16.25, 19.25, 22.25]

# Patas: cadera, rodilla y pie de cada line() del dibujado, y su lado (y).
# Las de cada par van una a cada lado, pegadas al plano medio, para que el cuerpo las tape como allí.
LEGS = [
    ("leg_a", 14, 8, 5, -0.07),
    ("leg_b", 18, 14, 13, 0.07),
    ("leg_c", 24, 28, 26, -0.07),
    ("leg_d", 28, 36, 37, 0.07),
]
FOOT_Z = 0.02

# Aguijón: arranque, y largo y grosor de cada tramo. Los dos primeros son la cola de
# reposo; al picar se suman los otros dos (en reposo quedan fuera del cuadro).
TAIL = _at(10, 17)
TAIL_SEGS = [("tail1", 0.47, 0.12, SHELL), ("tail2", 0.27, 0.1, DARK), ("tail3", 0.6, 0.1, SHELL), ("tail4", 0.62, 0.09, DARK)]
STING_LEN = 0.16


def _turn(v, a):
    """Vector (x, z) girado `a` grados alrededor de Y, como los pivotes."""
    c, s = cos(radians(a)), sin(radians(a))
    return (v[0] * c + v[1] * s, -v[0] * s + v[1] * c)


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def _rest_legs():
    """Cadera, rodilla y pie de cada pata en reposo (centros de las líneas de 2 px)."""
    out = {}
    for name, hx, kx, fx, side in LEGS:
        hip, knee = _at(hx + 1, 19), _at(kx + 1, 11)
        foot = (_at(fx + 1, 34)[0], FOOT_Z)
        out[name] = (hip, knee, foot, side)
    return out


REST = _rest_legs()


def build(rig):
    # Peana que desliza el cuerpo adelante y atrás: un pivote girado 90° convierte el `lift`
    # de su hijo en un desplazamiento en x, y el hijo deshace el giro.
    rig.pivot("slide", (0, 0, 0))
    rig.pivot("lunge", (0, 0, 0), "slide")
    (bx, bz), ax, ay, az = BODY
    rig.pivot("body", (bx, 0, bz), "lunge")

    # Caparazón: óvalo alargado con sus surcos.
    rig.part("ball", "body", (0, 0, 0), (2 * ax, 2 * ay, 2 * az), SHELL)
    for sx in SEAMS:
        dx = _at(sx, 0)[0] - bx
        k = max(0.0, 1 - (dx / ax) ** 2) ** 0.5
        rig.part("tube", "body", (dx, 0, 0), (2 * az * k + 0.03, 2 * ay * k + 0.03, 0.035), DARK, rot=(0, 90, 0))

    # Cabeza redonda por delante, con los ojos en racimo y el palpo.
    nx, nz = NECK
    rig.pivot("head", (nx - bx, 0, nz - bz), "body")
    (hx, hz), hax, hay, haz = HEAD
    hc = (hx - nx, hz - nz)
    rig.part("ball", "head", (hc[0], 0, hc[1]), (2 * hax, 2 * hay, 2 * haz), SHELL)
    for (ex, ey), size, ramp in (((33.5, 13.5), 0.07, EYE), ((36.5, 12.5), 0.06, EYE), ((34.5, 16.5), 0.07, EYE), ((35.5, 14.5), 0.09, SPARK)):
        x, z = _at(ex, ey)
        dx, dz = x - hx, z - hz
        y = -hay * max(0.05, 1 - (dx / hax) ** 2 - (dz / haz) ** 2) ** 0.5
        rig.part("ball", "head", (hc[0] + dx, y, hc[1] + dz), size, ramp)
    # Palpos: de la boca hacia delante y abajo, uno a cada lado, afilados en la punta.
    (px0, pz0), (px1, pz1) = _at(36, 18.5), _at(40.5, 20.5)
    aim = degrees(atan2(px1 - px0, pz1 - pz0))
    for side in (-0.08, 0.08):
        rig.part("cone", "head", ((px0 + px1) / 2 - nx, side, (pz0 + pz1) / 2 - nz), (0.06, 0.06, hypot(px1 - px0, pz1 - pz0)), PALP, rot=(0, aim, 0))

    # Patas: muslo y espinilla, que se afina hacia el pie.
    for name, (hip, knee, foot, side) in REST.items():
        rig.pivot(name, (hip[0] - bx, side, hip[1] - bz), "body")
        thigh = hypot(*_sub(knee, hip))
        shin = hypot(*_sub(foot, knee))
        rig.part("tube", name, (0, 0, -thigh / 2), (0.1, 0.1, thigh), LEG)
        rig.pivot(name + "_k", (0, 0, -thigh), name)
        rig.part("ball", name + "_k", (0, 0, 0), 0.12, LEG)
        rig.part("frustum", name + "_k", (0, 0, -shin / 2), (0.1, 0.1, shin), LEG, rot=(180, 0, 0), taper=0.5)

    # Aguijón: tramos encadenados con nudos, y una punta para cada largo.
    parent, at = "body", (TAIL[0] - bx, 0, TAIL[1] - bz)
    for name, length, width, ramp in TAIL_SEGS:
        rig.pivot(name, at, parent)
        rig.part("ball", name, (0, 0, 0), width * 1.25, ramp)
        rig.part("tube", name, (0, 0, length / 2), (width, width, length), ramp)
        parent, at = name, (0, 0, length)
        if name == "tail2":
            rig.pivot("sting_rest", at, "tail2")
            _sting(rig, "sting_rest", width)
    rig.pivot("sting", at, parent)
    _sting(rig, "sting", TAIL_SEGS[-1][2])


def _sting(rig, pivot, width):
    rig.part("ball", pivot, (0, 0, 0), width * 1.3, DARK)
    rig.part("cone", pivot, (0, 0, STING_LEN / 2), (width * 1.1, width * 1.1, STING_LEN), STING)


def _knee(hip, foot, l1, l2, bend):
    """Rodilla de una pata de muslo `l1` y espinilla `l2` entre la cadera y el pie, doblada hacia `bend`."""
    dx, dz = _sub(foot, hip)
    d = min(hypot(dx, dz), l1 + l2 - 1e-4)
    a = (l1**2 - l2**2 + d**2) / (2 * d)
    h = max(0.0, l1**2 - a**2) ** 0.5
    ux, uz = dx / hypot(dx, dz), dz / hypot(dx, dz)
    return (hip[0] + a * ux - bend * h * uz, hip[1] + a * uz + bend * h * ux)


def _hang(v):
    """Giro que apunta hacia `v` una pieza que cuelga (eje -Z) de su pivote."""
    return degrees(atan2(-v[0], -v[1]))


def _pose(lean=0, shift=0, bob=0, head=0, tail=(-32, 22), sting=25):
    """
    Pose con el cuerpo inclinado `lean` grados (+ cabeza abajo), desplazado `shift` en x y `bob` en z;
    `tail` son los giros en el mundo de cada tramo del aguijón (0 = hacia arriba, + = hacia delante).
    """
    turns = {"slide": 90, "lunge": -90, "body": lean, "head": head}
    lift = {"lunge": shift, "body": bob}
    (bx, bz) = BODY[0]
    for name, (hip, knee, foot, side) in REST.items():
        l1, l2 = hypot(*_sub(knee, hip)), hypot(*_sub(foot, knee))
        # Hacia qué lado se dobla la rodilla, como en reposo.
        cross = (foot[0] - hip[0]) * (knee[1] - hip[1]) - (foot[1] - hip[1]) * (knee[0] - hip[0])
        bend = 1 if cross > 0 else -1
        rx, rz = _turn((hip[0] - bx, hip[1] - bz), lean)
        h = (bx + shift + rx, bz + bob + rz)
        k = _knee(h, foot, l1, l2, bend)
        a1 = _hang(_sub(k, h))
        a2 = _hang(_sub(foot, k))
        turns[name] = a1 - lean
        turns[name + "_k"] = a2 - a1
    prev = lean
    for (name, *_), a in zip(TAIL_SEGS, tail):
        turns[name] = a - prev
        prev = a
    # El aguijón largo del picotazo y el corto del reposo son piezas distintas: se ve uno u otro.
    if len(tail) > 2:
        turns["sting"] = sting - prev
        hide = ("sting_rest",)
    else:
        turns["sting_rest"] = sting - prev
        hide = ("tail3",)
    return turns, lift, hide


# Reposo (dos cuadros, el segundo un píxel base más bajo), picotazo y dolor.
POSES = [
    _pose(),
    _pose(bob=-0.05, tail=(-30, 24)),
    # El cuerpo carga hacia delante y el aguijón pasa por encima del lomo hasta caer ante la cabeza.
    _pose(lean=5, shift=0.1, head=8, tail=(12, 55, 88, 122), sting=140),
    # Retrocede: el cuerpo se echa atrás con la cabeza alzada y el aguijón se encoge.
    _pose(lean=-7, shift=-0.08, head=-12, tail=(-45, -12), sting=-5),
]


def pose(rig, f):
    rig.pose(*POSES[f])
