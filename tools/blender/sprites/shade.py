"""
Sombra: la misma criatura que drawShade() de characters.ts, en 3D.

Una silueta de humo morado oscuro, sin brazos ni piernas, que flota: estrecha
y redondeada arriba, ancha en el medio y algo más estrecha abajo, con los
bordes ondulados y el faldón deshecho en hebras de humo que cuelgan. Dos ojos
rojos que brillan, con el centro casi blanco, en el lado de delante de la
cabeza. Al atacar se echa hacia delante, alarga tres zarpas de humo en abanico
con las puntas rojas y los ojos se le encienden en una raya; al recibir un
golpe se echa hacia atrás y las hebras se le van hacia delante. Los colores son
los del dibujado, en rampas (luz, base, sombra).
"""

from math import cos, radians, sin

# Cuadro en la rejilla base: algo más ancho que los 32 del dibujado para que quepan las zarpas.
SIZE = (36, 40)
# Alto visible del cuadro en unidades: 20 píxeles base por unidad, como 40 filas del dibujado.
VIEW = SIZE[1] / 20
# Giro hacia la cámara: las zarpas salen hacia delante y algo hacia el que mira.
TURN = 35

# Humo (body en drawShade), ojos (0xff3a4a con brillo 0xffc0c0/0xffe0e0) y puntas de las zarpas.
SMOKE = (0x3A2A4A, 0x241A30, 0x140E1C)
EYE = (0xFFC0C0, 0xFF3A4A, 0xD8283A)
SPARK = (0xFFE0E0, 0xFFE0E0, 0xFFC0C0)
TIP = (0xFFA0A8, 0xFF5A6A, 0xD03A4A)

# Hacia dónde mira la cámara en el modelo (grados de giro desde el frente, +X).
CAMERA = -90 + TURN
# Altura del pivote del cuerpo, abajo del todo: al inclinarse, la cabeza es lo que más se mueve.
BODY = 0.28


def build(rig):
    # Cuerpo: todo cuelga de él para que flote y se balancee a la vez.
    rig.pivot("body", (0, 0, BODY))
    # Faldón que se estrecha hacia abajo, vientre ancho y cúpula estrecha arriba.
    rig.part("frustum", "body", (0, 0, 0.45 - BODY), (0.48, 0.48, 0.34), SMOKE, taper=1.3)
    rig.part("ball", "body", (0, 0, 0.86 - BODY), (0.66, 0.66, 1.1), SMOKE)
    rig.part("ball", "body", (0, 0, 1.25 - BODY), (0.5, 0.5, 0.6), SMOKE)
    # Bultos de humo que ondulan los bordes, alternando de lado.
    for x, z, s in ((0.27, 0.66, 0.22), (-0.28, 0.5, 0.22), (0.21, 0.36, 0.18), (-0.25, 0.98, 0.18), (-0.21, 0.3, 0.16)):
        cx, cy, cz = _across(x, z - BODY)
        rig.part("ball", "body", (cx, cy, cz), (s, s, s * 0.8), SMOKE)

    # Jirones: el faldón se deshace en hebras de humo que cuelgan, de largos distintos y
    # separadas, como las filas sueltas del dibujado.
    rig.pivot("tail", (0, 0, 0), "body")
    for x, h, tilt in ((-0.17, 0.2, -12), (-0.03, 0.27, 4), (0.12, 0.2, 14), (0.2, 0.12, 24)):
        cx, cy, _ = _across(x, 0)
        rig.part("cone", "tail", (cx + 0.02, cy, 0.04 - h / 2), (0.14, 0.14, h), SMOKE, rot=(180, tilt, 0))

    # Ojos de cara a la cámara, en el lado de delante: el de delante casi en el borde, como en el dibujado.
    for yaw in (2, -36):
        x, y = _on_head(yaw, 0.27)
        rig.part("box", "body", (x, y, 1.15 - BODY), (0.03, 0.1, 0.1), EYE, rot=(0, 0, CAMERA))
        x, y = _on_head(yaw - 2, 0.285)
        rig.part("box", "body", (x, y, 1.158 - BODY), (0.02, 0.055, 0.055), SPARK, rot=(0, 0, CAMERA))

    # Raya encendida sobre los ojos, solo al atacar.
    rig.pivot("brow", (0, 0, 0), "body")
    x, y = _on_head(-22, 0.26)
    rig.part("box", "brow", (x, y, 1.23 - BODY), (0.02, 0.26, 0.045), EYE, rot=(0, 0, CAMERA))

    # Zarpas de humo en abanico, con la punta roja; solo al atacar.
    rig.pivot("claws", (0.12, -0.04, 0.72 - BODY), "body")
    for z, angle in ((0.14, 64), (-0.04, 86), (-0.22, 104)):
        rig.part("frustum", "claws", _along(angle, 0.36, z), (0.16, 0.16, 0.72), SMOKE, rot=(0, angle, 0), taper=0.55)
        rig.part("ball", "claws", _along(angle, 0.74, z), 0.08, TIP)


def _along(angle, d, z):
    """Punto a `d` del pivote de las zarpas, en la dirección inclinada `angle` grados desde la vertical."""
    return (d * sin(radians(angle)), 0, z + d * cos(radians(angle)))


def _across(x, z):
    """Punto a `x` del eje, de lado en la pantalla (perpendicular a la cámara), a la altura z."""
    return (x * cos(radians(CAMERA + 90)), x * sin(radians(CAMERA + 90)), z)


def _on_head(yaw, r):
    """Punto a `r` del eje de la cabeza, girado `yaw` grados desde el frente."""
    return (r * cos(radians(yaw)), r * sin(radians(yaw)))


# Reposo (dos cuadros, el segundo un píxel base más bajo), zarpazo y dolor.
# Las garras y la raya roja sobre los ojos solo salen en el zarpazo.
_HIDDEN = ("brow", "claws")
POSES = [
    ({}, {}, _HIDDEN),
    ({"tail": 4}, {"body": -0.05}, _HIDDEN),
    ({"body": 8, "tail": -14}, {}),
    ({"body": -10, "tail": 22}, {}, _HIDDEN),
]


def pose(rig, f):
    rig.pose(*POSES[f])
