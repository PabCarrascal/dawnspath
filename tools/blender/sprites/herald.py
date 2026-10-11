"""
Heraldo de la Noche: el mismo jefe que drawHerald() de characters.ts, en 3D.

Alto y estrecho: una túnica morada larga hasta el suelo que se abre hacia
abajo y acaba deshilachada en jirones, con una franja clara en el pecho y una
gema azul colgando debajo. Calavera grande de hueso con las cuencas oscuras,
ojos que brillan en azul pálido, la raja de los dientes y una corona de púas
negras que se abren hacia fuera. Con el brazo de detrás, de manga oscura y
mano huesuda, sujeta la guadaña: asta de madera hasta el suelo y la hoja curva
arriba, hacia delante. En el tajo la guadaña cae en diagonal y la hoja barre
por delante, abajo. Los colores son los del dibujado, en rampas (luz, base, sombra).
"""

from math import cos, pi, radians, sin

# Cuadro en la rejilla base: algo más ancho que los 44 del dibujado para que quepa la hoja del tajo.
SIZE = (48, 58)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 58 filas del dibujado.
VIEW = SIZE[1] / 20
# Algo menos de giro que por defecto: la calavera mira casi de frente y la hoja no se acorta tanto.
TURN = 30

# Túnica: en el dibujado cada fila queda en el tono claro (robe[0]); la manga va en robe[1].
ROBE = (0x4A3864, 0x3A2A4E, 0x241A34)
SLEEVE = (0x3A2A4E, 0x241A34, 0x140E1E)
SASH = (0x7A6A9A, 0x5A4A7A, 0x3A2E52)
GEM = (0xB0E0FF, 0x6AB0FF, 0x2A6AC0)
BONE = (0xF4ECD8, 0xD8D0BC, 0xA89C88)
# Cuencas y dientes (0x14101c) y los ojos que brillan dentro.
HOLE = (0x241C2E, 0x14101C, 0x0C0812)
GLOW = (0xFFFFFF, 0xD0F0FF, 0x7AC0FF)
# Púas de la corona, con el destello de las puntas (0x8a7aa8) en el tono de luz.
CROWN = (0x5A4A78, 0x2A2034, 0x1A1424)
# Asta (wood[2] del dibujado) y hoja: filo gris, punta clara y canto oscuro.
HAFT = (0x7A5030, 0x553418, 0x3A2410)
BLADE = (0xE8ECF4, 0xB8BCC8, 0x6A7080)
TIP = (0xFFFFFF, 0xE8ECF4, 0xB8BCC8)
EDGE = (0x8A90A0, 0x6A7080, 0x4A5060)

# Túnica: radio lateral (y) en el suelo y bajo la calavera; de frente es algo más estrecha.
HEM, HEM_Z = 0.56, 0.0
NECK, NECK_Z = 0.24, 1.93
DEPTH = 0.85
HIPS = 0.4
# Lo que mira a la cámara (franja, gema, cara): algo menos que de frente a ella, como el dibujado.
FRONT = -45

# Brazo: largo y bajada desde el hombro; la guadaña se agarra en la mano.
ARM = 0.55
# Hoja: cuántos tramos, cuerda y cuánto se arquea hacia fuera.
SEGMENTS = 14
CHORD = 0.62
BULGE = 0.2


def _radius(z):
    return HEM + (NECK - HEM) * (z - HEM_Z) / (NECK_Z - HEM_Z)


def _frustum(rig, parent, z0, z1, color, base=0.0):
    """Tronco de cono de la túnica entre las alturas z0 y z1 (absolutas); `base` es la altura del pivote."""
    r0, r1 = _radius(z0), _radius(z1)
    loc = (0, 0, (z0 + z1) / 2 - base)
    return rig.part("frustum", parent, loc, (2 * r0 * DEPTH, 2 * r0, z1 - z0), color, taper=r1 / r0)


def _on_robe(z, yaw, out=0.0):
    """Punto de la superficie de la túnica a la altura z, girado `yaw` grados desde el frente."""
    r = _radius(z) + out
    return (r * DEPTH * cos(radians(yaw)), r * sin(radians(yaw)), z)


def _on_skull(yaw, r, z):
    """Punto de la calavera, girado `yaw` grados desde el frente."""
    return (r * cos(radians(yaw)), r * sin(radians(yaw)), z)


def _arc(t):
    """Punto de la hoja a lo largo de su cuerda (x) y arqueado hacia fuera (z)."""
    return (CHORD * t, BULGE * sin(pi * t))


def build(rig):
    # Algo a la izquierda del centro, como el dibujado: la guadaña ocupa la derecha del cuadro.
    rig.stand.location.x = -0.15

    # Ruedo deshilachado, quieto en el suelo: jirones que cuelgan en punta.
    for k in range(16):
        a = radians(k * 360 / 16)
        r = _radius(0.12) * 0.92
        rig.part("cone", "root", (r * DEPTH * cos(a), r * sin(a), 0.1), (0.17, 0.17, 0.2), ROBE, rot=(180, 0, 0))
    _frustum(rig, "root", 0.12, 0.46, ROBE)

    # El resto de la túnica baja con el balanceo, como en el dibujado.
    rig.pivot("hips", (0, 0, HIPS))
    _frustum(rig, "hips", HIPS, NECK_Z, ROBE, HIPS)
    # Franja clara en el pecho y la gema colgando debajo.
    x, y, z = _on_robe(1.36, FRONT, 0.0)
    rig.part("box", "hips", (x, y, z - HIPS), (0.08, 0.32, 0.11), SASH, rot=(0, -8, FRONT))
    x, y, z = _on_robe(1.19, FRONT, 0.02)
    rig.part("ball", "hips", (x, y, z - HIPS), (0.12, 0.2, 0.2), GEM, rot=(0, 0, FRONT))

    # Calavera grande con cuencas, ojos que brillan y la raja de los dientes.
    rig.pivot("head", (0, 0, 2.22 - HIPS), "hips")
    rig.part("ball", "head", (0, 0, 0), (0.64, 0.64, 0.72), BONE)
    for yaw in (FRONT + 22, FRONT - 22):
        rig.part("box", "head", _on_skull(yaw, 0.28, 0.0), (0.08, 0.15, 0.15), HOLE, rot=(0, 0, yaw))
        rig.part("box", "head", _on_skull(yaw, 0.315, 0.0), (0.03, 0.06, 0.06), GLOW, rot=(0, 0, yaw))
    rig.part("box", "head", _on_skull(FRONT + 6, 0.24, -0.21), (0.06, 0.25, 0.05), HOLE, rot=(0, 0, FRONT + 6))
    # Corona de púas que se abren hacia fuera desde lo alto de la calavera.
    for k in range(8):
        a = k * 360 / 8 + 22.5
        r, tilt, length = 0.2, 30, 0.37
        x, y = r * cos(radians(a)), r * sin(radians(a))
        lean = length / 2 * sin(radians(tilt))
        loc = (x + lean * cos(radians(a)), y + lean * sin(radians(a)), 0.26 + length / 2 * cos(radians(tilt)))
        rig.part("cone", "head", loc, (0.1, 0.1, length), CROWN, rot=(0, tilt, a))

    # Brazo de detrás: manga oscura hacia delante y mano huesuda sobre el asta.
    rig.pivot("shoulder", (0.06, 0.25, 1.72 - HIPS), "hips")
    rig.part("tube", "shoulder", (ARM / 2, 0, 0), (0.15, 0.15, ARM), SLEEVE, rot=(0, 90, 0))
    rig.part("ball", "shoulder", (ARM + 0.02, 0, 0), 0.16, BONE)

    # Guadaña: "scythe" la orienta desde la mano y "haft" la desliza a lo largo del asta.
    rig.pivot("scythe", (ARM + 0.02, 0, 0), "shoulder")
    rig.pivot("haft", (0, 0, 0), "scythe")
    rig.part("tube", "haft", (0, 0, -0.29), (0.09, 0.09, 2.22), HAFT)
    # Hoja en tramos: cada uno es un pivote para poder darle la vuelta al arco en el tajo.
    rig.pivot("blade", (0, 0, 0.82), "haft")
    for i in range(SEGMENTS):
        t = i / (SEGMENTS - 1)
        x, z = _arc(t)
        rig.pivot(f"b{i}", (x, 0, z), "blade")
        s = 1 - 0.35 * t
        rig.part("box", f"b{i}", (0, 0, 0.01), (0.11, 0.05, 0.12 * s), TIP if t > 0.8 else BLADE)
        rig.part("box", f"b{i}", (0, 0, -0.065 * s), (0.1, 0.04, 0.05), EDGE)


def _scythe(turns, angle, blade, flip=False):
    """La guadaña a `angle` grados y la hoja a `blade`, sin contar lo que giren cadera y hombro."""
    turns["scythe"] = angle - turns.get("hips", 0) - turns.get("shoulder", 0)
    turns["blade"] = blade - angle
    lift = {}
    if flip:
        # Arco al revés: hacia el otro lado de la cuerda.
        for i in range(SEGMENTS):
            lift[f"b{i}"] = -2 * _arc(i / (SEGMENTS - 1))[1]
    return turns, lift


def _with(pair, lift):
    turns, more = pair
    return turns, {**more, **lift}


# Reposo (dos cuadros, el segundo un píxel base más bajo), tajo y dolor.
# En el tajo la guadaña da casi media vuelta: la hoja queda abajo, por delante, y
# sube arqueada hacia fuera; "haft" desliza el asta para que la hoja baje hasta el suelo.
POSES = [
    _scythe({"shoulder": 27}, 0, 28),
    _with(_scythe({"shoulder": 26}, 0, 28), {"hips": -0.05}),
    _with(_scythe({"hips": 8, "head": 4, "shoulder": 40}, 164, -96, flip=True), {"haft": 0.36}),
    _scythe({"hips": -10, "head": -10, "shoulder": 5}, -12, 24),
]


def pose(rig, f):
    rig.pose(*POSES[f])
