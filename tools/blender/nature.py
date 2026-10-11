"""
Árboles y rocas de las maquetas, para exportar a GLB con modeling.export.

Medidas para un árbol de tamaño 1 (el juego lo escala). Cada árbol son pocas
mallas: el tronco con sus ramas, la copa (bajo el nodo «crown», que el juego
mece con el viento) y los racimos de hojas sueltas. Los materiales llevan el
nombre que el juego cambia por los suyos (ver Kit.tree en src/hd2d/diorama/kit.ts):

- bark: corteza; deadwood y twigs: madera seca (se quedan con su color).
- leaves: grumos de la copa, con su color de hojas según el bioma; llevan un
  degradado por vértice, más oscuro abajo, como las copas del juego.
- leafcard y frond: racimos y hebras con transparencia.
- stone y snow: la piedra de cada bioma y la nieve de las rocas nevadas
  (la malla «snowcap» se quita si la roca no está nevada).
"""

import random
from math import cos, pi, radians, sin

import bpy
from mathutils import Vector, noise

from modeling import COLORS, material

COLORS.update(
    {
        "bark": (0.36, 0.25, 0.16),
        "deadwood": (0.23, 0.18, 0.16),
        "twigs": (0.18, 0.14, 0.13),
        "leaves": (0.24, 0.42, 0.16),
        "leafcard": (0.3, 0.5, 0.2),
        "frond": (0.4, 0.55, 0.25),
        "snow": (0.92, 0.95, 1.0),
    }
)


def _obj(name, mesh_op, mat, **kw):
    mesh_op(**kw)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material(mat))
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def join(objs, name):
    """Une las piezas en una sola malla (un solo dibujado en el juego)."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def limb(a, b, r0, r1, mat, verts=6):
    """Rama o tronco: cilindro que se estrecha de `a` a `b`."""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = _obj("rama", bpy.ops.mesh.primitive_cone_add, mat, vertices=verts, radius1=r0, radius2=r1, depth=d.length, location=(a + b) / 2)
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return o


def lump(center, radius, rng, mat="leaves", squash=1.0, rough=0.22):
    """Grumo de copa: icosfera algo deforme, como un puñado de hojas."""
    o = _obj("grumo", bpy.ops.mesh.primitive_ico_sphere_add, mat, radius=radius, subdivisions=1, location=center)
    seed = Vector((rng.random() * 50, rng.random() * 50, rng.random() * 50))
    for v in o.data.vertices:
        n = noise.noise(v.co * 2.2 + seed)
        v.co *= 1 + rough * n
        v.co.z *= squash
    return o


def cards(spots, size, mat="leafcard"):
    """Racimos sueltos: dos planos cruzados por sitio, que rompen la silueta de la copa."""
    objs = []
    for p, turn in spots:
        for k in (0, 1):
            o = _obj("racimo", bpy.ops.mesh.primitive_plane_add, mat, size=size, location=p)
            o.rotation_euler = (radians(90), 0, turn + k * pi / 2)
            objs.append(o)
    return objs


def shade_by_height(o, low=0.55, high=1.05):
    """Degradado por vértice, oscuro abajo y claro arriba (lo usa el material de hojas del juego)."""
    me = o.data
    zs = [v.co.z for v in me.vertices]
    z0, z1 = min(zs), max(zs)
    attr = me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    for loop in me.loops:
        z = me.vertices[loop.vertex_index].co.z
        v = min(1.0, low + (high - low) * (z - z0) / ((z1 - z0) or 1))
        attr.data[loop.index].color = (v, v, v, 1)
    me.color_attributes.active_color = attr


def crown_node(parts):
    """Agrupa la copa bajo un nodo «crown» con origen en el pie del árbol (para mecerla)."""
    e = bpy.data.objects.new("crown", None)
    bpy.context.scene.collection.objects.link(e)
    for p in parts:
        p.parent = e
    return e


def _branches(rng, n, h, spread, rise=0.45):
    """Puntas de las ramas principales: alrededor del eje, a distintas alturas."""
    out = []
    for k in range(n):
        a = (k / n) * 2 * pi + rng.uniform(-0.4, 0.4)
        r = spread * rng.uniform(0.7, 1.0)
        out.append(Vector((cos(a) * r, sin(a) * r, h + rise * rng.uniform(0.6, 1.2))))
    return out


def round_tree(seed):
    """Frondoso: tronco algo torcido que se abre en ramas, cada una con su grumo de copa."""
    rng = random.Random(seed)
    lean = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 0))
    fork = Vector((0, 0, 1.25)) + lean
    wood = [limb((0, 0, 0), fork, 0.16, 0.1, "bark", 7)]
    for k in range(3):
        a = k / 3 * 2 * pi + rng.random()
        wood.append(limb((0, 0, 0.02), (cos(a) * 0.32, sin(a) * 0.32, -0.02), 0.09, 0.03, "bark", 5))
    tips = _branches(rng, rng.choice((3, 4)), 1.55, 0.5)
    for t in tips:
        wood.append(limb(fork, t, 0.08, 0.04, "bark", 5))
    trunk = join(wood, "tronco")
    blobs = [lump(fork + Vector((0, 0, 0.75)), 0.72, rng, squash=0.85)]
    for t in tips:
        blobs.append(lump(t + Vector((0, 0, 0.12)), rng.uniform(0.42, 0.56), rng))
    blobs.append(lump(fork + Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 1.35)), 0.4, rng))
    leaves = join(blobs, "copa")
    shade_by_height(leaves)
    spots = []
    for _ in range(9):
        a = rng.random() * 2 * pi
        z = 1.7 + rng.uniform(-0.25, 0.8)
        r = 0.8 * (1 - max(0.0, z - 2.1) / 1.2)
        spots.append((Vector((cos(a) * r, sin(a) * r, z)), a))
    leafcards = join(cards(spots, 0.62), "racimos")
    crown_node([leaves, leafcards])
    return trunk


def willow(seed):
    """Sauce: copa ancha y caída, con hebras de hojas que cuelgan."""
    rng = random.Random(seed)
    fork = Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 1.25))
    wood = [limb((0, 0, 0), fork, 0.17, 0.11, "bark", 7)]
    tips = _branches(rng, 5, 1.45, 0.6, rise=0.25)
    for t in tips:
        wood.append(limb(fork, t, 0.07, 0.04, "bark", 5))
    trunk = join(wood, "tronco")
    blobs = [lump(fork + Vector((0, 0, 0.45)), 0.75, rng, squash=0.7)]
    for t in tips:
        blobs.append(lump(t, rng.uniform(0.4, 0.5), rng, squash=0.8))
    leaves = join(blobs, "copa")
    shade_by_height(leaves)
    fronds = []
    for t in tips + [fork + Vector((0, 0, 0.4))]:
        for k in (0, 1):
            o = _obj("hebra", bpy.ops.mesh.primitive_plane_add, "frond", size=1, location=t * 1.2 + Vector((0, 0, -0.45)))
            o.scale = (0.55, 1, rng.uniform(0.9, 1.3))
            o.rotation_euler = (radians(90), 0, rng.random() * pi + k * pi / 2)
            fronds.append(o)
    hang = join(fronds, "hebras")
    crown_node([leaves, hang])
    return trunk


def pine(seed):
    """Pino: pisos de faldones dentados que se estrechan, cada uno algo girado."""
    rng = random.Random(seed)
    trunk = join([limb((0, 0, 0), (0, 0, 1.2), 0.15, 0.08, "bark", 6)], "tronco")
    tiers = []
    n = 5
    for k in range(n):
        f = k / (n - 1)
        r = (1.0 - f * 0.72) * 0.88
        z = 0.6 + f * 1.75
        o = _obj("piso", bpy.ops.mesh.primitive_cone_add, "leaves", vertices=10, radius1=r, radius2=0, depth=0.78 - f * 0.15, location=(rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), z))
        o.rotation_euler.z = rng.random() * pi
        # Borde dentado: los vértices de abajo, alternos, más cortos y algo caídos.
        for i, v in enumerate(o.data.vertices):
            if v.co.z < 0 and i % 2:
                v.co.x *= 0.72
                v.co.y *= 0.72
                v.co.z += 0.08
        tiers.append(o)
    leaves = join(tiers, "copa")
    shade_by_height(leaves)
    crown_node([leaves])
    return trunk


def dead_tree(seed):
    """Árbol muerto: tronco torcido con ramas que se bifurcan, sin hojas."""
    rng = random.Random(seed)
    pts = [Vector((0, 0, 0))]
    for k in range(3):
        pts.append(pts[-1] + Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 0.75)))
    wood = [limb(pts[k], pts[k + 1], 0.15 - k * 0.035, 0.12 - k * 0.035, "deadwood", 6) for k in range(3)]
    twigs = []

    def grow(a, d, length, depth):
        b = a + d * length
        (wood if depth == 2 else twigs).append(limb(a, b, 0.05 * depth / 2 + 0.015, 0.015, "deadwood" if depth == 2 else "twigs", 4))
        if depth > 1:
            for s in (-1, 1):
                nd = (d + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 0.5)) * 0.8 * s).normalized()
                nd.z = abs(nd.z) * 0.7 + 0.2
                grow(b, nd.normalized(), length * 0.55, depth - 1)

    for k in range(5):
        a = k / 5 * 2 * pi + rng.random()
        start = pts[1].lerp(pts[3], rng.uniform(0.2, 0.9))
        d = Vector((cos(a), sin(a), rng.uniform(0.3, 0.9))).normalized()
        grow(start, d, rng.uniform(0.55, 0.85), 2)
    trunk = join(wood, "tronco")
    crown_node([join(twigs, "ramitas")])
    return trunk


def rock(seed, flat=False):
    """Roca: icosfera deformada y asentada (la base, plana), con un gorro de nieve aparte."""
    rng = random.Random(seed)
    o = _obj("roca", bpy.ops.mesh.primitive_ico_sphere_add, "stone", radius=1, subdivisions=1, location=(0, 0, 0))
    off = Vector((rng.random() * 40, rng.random() * 40, rng.random() * 40))
    for v in o.data.vertices:
        v.co *= 1 + 0.28 * noise.noise(v.co * 1.4 + off)
        v.co.z = max(v.co.z, -0.35)
        if flat:
            v.co.z *= 0.55
    join([o], "roca")
    cap = _obj("snowcap", bpy.ops.mesh.primitive_ico_sphere_add, "snow", radius=1, subdivisions=1, location=(0, 0, 0.5 if not flat else 0.28))
    cap.scale = (0.82, 0.82, 0.3)
    for v in cap.data.vertices:
        v.co *= 1 + 0.15 * noise.noise(v.co * 2 + off)
    join([cap], "snowcap")
