"""
Cofre mímico: la misma criatura que drawMimic() de characters.ts, en 3D.

Un cofre de madera visto de costado, más largo que hondo, con la tapa
abisagrada atrás que se abre hacia delante como una boca: por dentro es rojo
oscuro, con dientes blancos en el borde de la caja y en el de la tapa, y dos
ojos amarillos que brillan en la garganta. Flejes dorados con remaches que
rodean caja y tapa, juntas oscuras entre las tablas, cerradura dorada al
frente y una lengua rosa que cuelga por delante. Al morder, la tapa se abre
del todo y la lengua sale disparada hacia delante; al recibir, el cofre se
echa atrás y cierra la boca. Los colores son los del dibujado, en rampas
(luz, base, sombra).
"""

# Cuadro en la rejilla base: algo más ancho que los 36 del dibujado para que quepa la lengua al morder.
SIZE = (38, 34)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 34 filas del dibujado.
VIEW = SIZE[1] / 20
# Giro hacia la cámara: se ve sobre todo el costado, y el frente con la cerradura a la derecha.
TURN = 30

from palette import GOLD

# Tonos del dibujado: madera (wood), boca, dientes (tooth), lengua y ojos (0xffe060).
WOOD = (0xA8743E, 0x80542A, 0x553418)
SEAM = (0x80542A, 0x6A4422, 0x4A2E14)
MOUTH = (0x5A1020, 0x3A0612, 0x24030A)
TOOTH = (0xFFFAF0, 0xF4ECD8, 0xC8BCA4)
TONGUE = (0xF08098, 0xE0607A, 0xB83A5A)
EYES = (0xFFF4A0, 0xFFE060, 0xF0C840)
LOCK = (0xFFF2C0, 0xFFE08A, 0xD8A83A)
KEYHOLE = 0x3A2A10

# Caja: largo (x, de la bisagra al frente), hondo (y) y alto; grosor de la tapa.
L, D, H = 1.15, 0.72, 0.62
LID = 0.24
# Paredes: cuánto se mete la garganta respecto a la caja.
WALL = 0.05
# Láminas de garganta que rellenan la boca abierta, repartidas entre caja y tapa.
JAWS = 5
# Flejes, en fracción del largo desde la bisagra (x = 9 y 23 sobre 4…30 en el dibujado).
STRAPS = (0.22, 0.72)


def build(rig):
    # Dos bisagras en el suelo: atrás para echarse hacia atrás y delante para lanzarse a morder.
    rig.pivot("rock", (-L / 2, 0, 0))
    rig.pivot("lunge", (L, 0, 0), "rock")
    back = -L

    # Caja, con juntas oscuras entre tablas en el costado y el frente.
    rig.part("box", "lunge", (back + L / 2, 0, H / 2), (L, D, H), WOOD)
    for z in (0.12, 0.3, 0.47):
        rig.part("box", "lunge", (back + L / 2, -D / 2, z), (L - 0.02, 0.02, 0.035), SEAM)
        rig.part("box", "lunge", (0, 0, z), (0.02, D - 0.02, 0.035), SEAM)
    # Suelo de la boca, rodeado por el borde de madera.
    rig.part("box", "lunge", (back + L / 2, 0, H), (L - 2 * WALL, D - 2 * WALL, 0.02), MOUTH)
    # Flejes dorados por los costados con tres remaches cada uno.
    for f in STRAPS:
        x = back + L * f
        for side in (-1, 1):
            rig.part("box", "lunge", (x, side * D / 2, H / 2), (0.1, 0.03, H), GOLD)
        for z in (0.1, 0.3, 0.5):
            rig.part("box", "lunge", (x, -D / 2 - 0.02, z), (0.05, 0.02, 0.05), LOCK)
    # Cerradura en el frente, bajo el borde, con el ojo de la llave.
    rig.part("box", "lunge", (0.015, 0, H - 0.2), (0.03, 0.16, 0.2), LOCK)
    rig.part("box", "lunge", (0.035, 0, H - 0.22), (0.02, 0.04, 0.06), KEYHOLE)
    # Dientes de abajo en el borde: costado de la cámara y frente.
    for x in _row(0.14, L - 0.05):
        rig.part("box", "lunge", (back + x, -D / 2 + 0.03, H + 0.04), (0.055, 0.05, 0.09), TOOTH)
    for y in _row(-D / 2 + 0.14, D / 2 - 0.05):
        rig.part("box", "lunge", (-0.03, y, H + 0.04), (0.05, 0.055, 0.09), TOOTH)

    # Garganta: láminas que giran con una fracción de la tapa y tapan el hueco de la boca.
    for k in range(1, JAWS + 1):
        rig.pivot(f"jaw{k}", (back, 0, H), "lunge")
        rig.part("box", f"jaw{k}", (L / 2 - 0.02, 0, 0), (L - 0.12, D - 2 * WALL, 0.16), MOUTH)
    # Ojos amarillos en la garganta, a media altura de la boca y hacia delante, donde los dientes no los tapan.
    mid = f"jaw{(JAWS + 1) // 2}"
    for x, z in ((0.55, 0.0), (0.77, 0.03)):
        rig.part("box", mid, (L * x, -D / 2 + WALL - 0.02, z), (0.13, 0.04, 0.13), EYES)

    # Tapa: tabla gruesa abisagrada atrás, rojo oscuro por debajo, con flejes y dientes de arriba.
    rig.pivot("lid", (back, 0, H), "lunge")
    rig.part("box", "lid", (L / 2, 0, LID / 2), (L + 0.02, D + 0.02, LID), WOOD)
    rig.part("box", "lid", (L / 2, 0, -0.005), (L - 2 * WALL, D - 2 * WALL, 0.02), MOUTH)
    rig.part("box", "lid", (L / 2, -D / 2 - 0.01, LID / 2), (L, 0.02, 0.035), SEAM)
    for f in STRAPS:
        rig.part("box", "lid", (L * f + 0.02, 0, LID / 2 + 0.01), (0.1, D + 0.05, LID + 0.01), GOLD)
        rig.part("box", "lid", (L * f + 0.02, -D / 2 - 0.035, LID / 2), (0.05, 0.02, 0.05), LOCK)
    for x in _row(0.2, L - 0.04):
        rig.part("box", "lid", (x, -D / 2 + 0.03, -0.04), (0.055, 0.05, 0.09), TOOTH)
    for y in _row(-D / 2 + 0.14, D / 2 - 0.05):
        rig.part("box", "lid", (L - 0.03, y, -0.04), (0.05, 0.055, 0.09), TOOTH)

    # Lengua: sale del fondo de la boca por el frente y la punta cuelga por delante de la caja.
    rig.pivot("tongue", (-0.2, -0.04, H + 0.02), "lunge")
    rig.part("ball", "tongue", (0.17, 0, 0), (0.4, 0.2, 0.1), TONGUE)
    rig.pivot("tip", (0.34, 0, 0), "tongue")
    rig.part("ball", "tip", (0.1, 0, 0), (0.26, 0.17, 0.1), TONGUE)


def _row(a, b, step=0.15):
    """Posiciones cada `step` entre a y b, como los dientes del dibujado (uno cada 3 píxeles)."""
    out = []
    while a <= b:
        out.append(a)
        a += step
    return out


def _mouth(turns, lid):
    """Abre la tapa `lid` grados (negativo levanta el frente) y reparte la garganta entre caja y tapa."""
    turns["lid"] = lid
    for k in range(1, JAWS + 1):
        turns[f"jaw{k}"] = lid * k / (JAWS + 1)
    return turns


# Reposo (dos cuadros: la boca se abre algo más y la lengua cuelga más), mordisco y dolor.
POSES = [
    (_mouth({"tongue": 8, "tip": 80}, -22), {}),
    (_mouth({"tongue": 14, "tip": 78}, -25), {}),
    (_mouth({"lunge": 4, "tongue": -14, "tip": 45}, -36), {"tongue": 0.1}),
    (_mouth({"rock": -9, "tongue": 30, "tip": 60}, -7), {}),
]


def pose(rig, f):
    rig.pose(*POSES[f])
