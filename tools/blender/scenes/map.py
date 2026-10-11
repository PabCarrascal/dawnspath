"""
Mapa del sendero: una maqueta low-poly del territorio vista desde el sur.

Los datos salen del juego (map.json, de export-map.ts): cada nodo tiñe su región
con el color de su tipo y la decora a juego (bosques, casas, ruinas, charcas,
pinchos del cubil…), al norte corre una cordillera, el río baja por su cauce y
los caminos dejan su tierra. Nada se pone encima de los nodos, los caminos, el
río ni la cartela: ahí van los dibujos del juego (SVG).

La cámara mira desde el sur, inclinada TILT grados respecto a la vertical, así
que montes, árboles y casas se ven de pie. El suelo solo se aplasta en vertical
(por cos TILT); al estirar la imagen después, cada punto del suelo cae en sus
mismas coordenadas del mapa (MAP_W × MAP_H) y lo que tiene altura sobresale
hacia el norte.
"""

import json
import os
import random
from math import cos, exp, hypot, radians, sin

import bpy
import numpy as np
from mathutils import Vector, noise

DATA = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "map.json")))
W, H = DATA["w"], DATA["h"]
NODES = DATA["nodes"]
# Una unidad de Blender son 100 unidades del mapa.
U = 100
TILT = 35
RES_X = 2000
STEP = 5

# Color del suelo de cada tipo de lugar (sRGB); se mezcla con GRASS para que sea solo un matiz.
GROUND = {
    "castle": (122, 156, 82),
    "meadow": (162, 168, 92),
    "village": (168, 160, 96),
    "forest": (70, 112, 56),
    "ruins": (150, 142, 108),
    "den": (92, 82, 96),
    "ford": (108, 150, 104),
    "shrine": (132, 164, 112),
    "mountain": (128, 126, 128),
    "bog": (80, 102, 74),
    "lair": (80, 68, 92),
}
GRASS = (112, 146, 74)
TINT = 0.55
ROCK = (128, 122, 126)
SNOW = (236, 238, 244)
DIRT = (178, 152, 104)
# Árboles por tipo de región: (probabilidad en cada hueco, clase de árbol).
TREES = {
    "forest": (0.8, "mixed"),
    "meadow": (0.06, "round"),
    "castle": (0.05, "round"),
    "village": (0.08, "round"),
    "shrine": (0.16, "round"),
    "ford": (0.12, "round"),
    "ruins": (0.07, "round"),
    "mountain": (0.14, "pine"),
    "bog": (0.22, "dead"),
    "den": (0.18, "dead"),
    "lair": (0.16, "dead"),
}

rng = random.Random(7)


def world(mx, my, z=0.0):
    """Punto del mapa (x a la derecha, y hacia abajo) en el mundo de Blender (z arriba, norte = +y)."""
    return Vector((mx / U, (H - my) / U, z))


def lin(c):
    return tuple(((v / 255 + 0.055) / 1.055) ** 2.4 if v / 255 > 0.04045 else v / 255 / 12.92 for v in c)


def mix(a, b, t):
    return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def clamp01(v):
    return max(0.0, min(1.0, v))


# ───────────────────────── caminos, río y zonas libres ─────────────────────────


def bez3(p, t):
    return (1 - t) ** 3 * p[0] + 3 * (1 - t) ** 2 * t * p[1] + 3 * (1 - t) * t * t * p[2] + t**3 * p[3]


RIVER = [(bez3(leg["x"], t / 40), bez3(leg["y"], t / 40)) for leg in DATA["river"] for t in range(41)]
NODE = {n["id"]: n for n in NODES}
ROADS = []
for r in DATA["roads"]:
    a, b, c = NODE[r["a"]], NODE[r["b"]], r["c"]
    for i in range(31):
        t = i / 30
        u = 1 - t
        ROADS.append((u * u * a["x"] + 2 * u * t * c["x"] + t * t * b["x"], u * u * a["y"] + 2 * u * t * c["y"] + t * t * b["y"]))


def near(points, x, y):
    return min(hypot(px - x, py - y) for px, py in points)


def owner(x, y):
    return min(NODES, key=lambda n: (n["x"] - x) ** 2 + (n["y"] - y) ** 2)


def free(x, y, pad=0.0):
    """Lejos de nodos, caminos, río y cartela: ahí se puede decorar."""
    if any(hypot(n["x"] - x, n["y"] - y) < 58 + pad for n in NODES):
        return False
    if any(hypot(l["x"] - x, l["y"] - y) < l["r"] + pad for l in DATA["labels"]):
        return False
    return near(ROADS, x, y) > 13 + pad and near(RIVER, x, y) > 18 + pad


# ───────────────────────── relieve ─────────────────────────

PEAKS = []
for row, (y0, hmax) in enumerate(((42, 0.7), (80, 0.58), (116, 0.42))):
    x = -20 + rng.random() * 30
    while x < W + 30:
        PEAKS.append((x, y0 + rng.uniform(-14, 14), hmax * rng.uniform(0.55, 1.0), rng.uniform(42, 70)))
        x += rng.uniform(40, 70)
# Montes alrededor del Paso del Lobo (sin tapar el nodo).
paso = next(n for n in NODES if n["type"] == "mountain")
for k in range(9):
    a = k / 9 * 6.283 + rng.random() * 0.4
    d = rng.uniform(78, 120)
    PEAKS.append((paso["x"] + cos(a) * d, paso["y"] + sin(a) * d * 0.8, rng.uniform(0.25, 0.45), rng.uniform(30, 45)))


def height(x, y):
    h = 0.025 * noise.noise(Vector((x / 90, y / 90, 0.3))) + 0.012 * noise.noise(Vector((x / 30, y / 30, 1.7)))
    for px, py, ph, pr in PEAKS:
        d = hypot(x - px, y - py) / pr
        if d < 1:
            h += ph * (1 - d) ** 1.6
    # Llano bajo cada nodo.
    for n in NODES:
        f = exp(-((hypot(n["x"] - x, n["y"] - y) / 46) ** 2))
        h = h * (1 - f)
    # El río abre un valle hasta el llano (también entre los montes) y talla su cauce, incluso en el vado.
    dr = near(RIVER, x, y)
    return h * (1 - exp(-((dr / 36) ** 2))) - 0.05 * exp(-((dr / 22) ** 2))


def ground_color(x, y, h):
    r = g = b = wsum = 0.0
    for n in NODES:
        w = 1 / ((n["x"] - x) ** 2 + (n["y"] - y) ** 2 + 400) ** 2
        c = GROUND[n["type"]]
        r, g, b, wsum = r + c[0] * w, g + c[1] * w, b + c[2] * w, wsum + w
    col = mix(GRASS, (r / wsum, g / wsum, b / wsum), TINT)
    # Roca donde el monte se empina y nieve en las cumbres.
    col = mix(col, ROCK, clamp01((h - 0.12) / 0.15))
    col = mix(col, SNOW, clamp01((h - 0.55) / 0.08))
    # Orillas más verdes y caminos de tierra.
    col = mix(col, (90, 128, 80), 0.5 * clamp01(1 - (near(RIVER, x, y) - 12) / 14))
    col = mix(col, DIRT, 0.85 * clamp01(1 - (near(ROADS, x, y) - 4) / 6))
    # Algo de variación, como de pincel.
    v = 1 + 0.06 * noise.noise(Vector((x / 14, y / 14, 4.2)))
    return tuple(min(255, c * v) for c in col)


# ───────────────────────── piezas ─────────────────────────


def material(name, color, rough=1.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*lin(color), 1)
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*lin(color), 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    return m


def mesh_object(name, verts, faces, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def primitive(add, mat, **kw):
    add(**kw)
    o = bpy.context.object
    o.data.materials.append(mat)
    return o


def place(proto, x, y, scale=1.0, turn=None):
    """Copia enlazada de `proto` apoyada en el suelo del punto (x, y) del mapa."""
    o = bpy.data.objects.new(proto.name, proto.data)
    bpy.context.scene.collection.objects.link(o)
    o.location = world(x, y, height(x, y))
    o.scale = (scale, scale, scale)
    o.rotation_euler.z = rng.random() * 6.283 if turn is None else turn
    return o


def protos():
    """Piezas base, cada una un único objeto (copa y tronco juntos) en el origen y ocultas."""
    leaf = material("hoja", (66, 112, 52))
    leaf2 = material("hoja clara", (98, 140, 62))
    pine = material("pino", (44, 86, 56))
    bark = material("corteza", (92, 64, 40))
    dead = material("seco", (58, 46, 52))
    wall = material("pared", (222, 206, 170))
    roof = material("tejado", (168, 74, 52))
    stone = material("piedra", (170, 162, 150))
    spike = material("pincho", (60, 34, 74))
    out = {}

    def join(name, parts):
        bpy.ops.object.select_all(action="DESELECT")
        for p in parts:
            p.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        o = bpy.context.object
        # La malla queda con el origen en la base: las copias se apoyan en el suelo.
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o.name = name
        o.hide_render = True
        o.hide_set(True)
        return o

    bpy.ops.object.select_all(action="DESELECT")

    def tree(name, crown):
        trunk = primitive(bpy.ops.mesh.primitive_cylinder_add, bark, radius=0.008, depth=0.05, vertices=6, location=(0, 0, 0.025))
        return join(name, [crown, trunk])

    out["round"] = tree("redondo", primitive(bpy.ops.mesh.primitive_ico_sphere_add, leaf, radius=0.045, subdivisions=1, location=(0, 0, 0.075)))
    out["round2"] = tree("redondo claro", primitive(bpy.ops.mesh.primitive_ico_sphere_add, leaf2, radius=0.04, subdivisions=1, location=(0, 0, 0.07)))
    out["pine"] = tree("pino", primitive(bpy.ops.mesh.primitive_cone_add, pine, radius1=0.04, depth=0.13, vertices=7, location=(0, 0, 0.1)))
    out["dead"] = join("seco", [primitive(bpy.ops.mesh.primitive_cone_add, dead, radius1=0.012, depth=0.11, vertices=5, location=(0, 0, 0.055))])
    body = primitive(bpy.ops.mesh.primitive_cube_add, wall, size=1, location=(0, 0, 0.02))
    body.scale = (0.06, 0.045, 0.04)
    top = primitive(bpy.ops.mesh.primitive_cone_add, roof, radius1=0.05, depth=0.035, vertices=4, location=(0, 0, 0.058))
    top.rotation_euler.z = radians(45)
    top.scale = (1.25, 0.95, 1)
    bpy.ops.object.select_all(action="DESELECT")
    out["house"] = join("casa", [body, top])
    bpy.ops.object.select_all(action="DESELECT")
    col = primitive(bpy.ops.mesh.primitive_cylinder_add, stone, radius=0.012, depth=0.06, vertices=6, location=(0, 0, 0.03))
    out["column"] = join("columna", [col])
    bpy.ops.object.select_all(action="DESELECT")
    blk = primitive(bpy.ops.mesh.primitive_cube_add, stone, size=0.03, location=(0, 0, 0.012))
    out["block"] = join("sillar", [blk])
    bpy.ops.object.select_all(action="DESELECT")
    sp = primitive(bpy.ops.mesh.primitive_cone_add, spike, radius1=0.02, depth=0.12, vertices=5, location=(0, 0, 0.06))
    out["spike"] = join("pincho", [sp])
    bpy.ops.object.select_all(action="DESELECT")
    return out


# ───────────────────────── escena ─────────────────────────


def terrain():
    nx, ny = W // STEP + 1, H // STEP + 1
    verts, faces, cols = [], [], []
    for j in range(ny):
        for i in range(nx):
            x, y = i * STEP, j * STEP
            h = height(x, y)
            verts.append(tuple(world(x, y, h)))
            cols.append(ground_color(x, y, h))
    for j in range(ny - 1):
        for i in range(nx - 1):
            a = j * nx + i
            faces.append((a, a + nx, a + nx + 1, a + 1))
    m = bpy.data.materials.new("suelo")
    m.use_nodes = True
    tree = m.node_tree
    bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 1
    attr = tree.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Col"
    tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    o = mesh_object("terreno", verts, faces, m)
    ca = o.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for k, c in enumerate(cols):
        ca.data[k].color = (*lin(c), 1)


def river():
    """Cinta de agua sobre el cauce, algo más ancha donde el río se remansa en el vado."""
    water = material("agua", (78, 128, 168), rough=0.35)
    verts, faces = [], []
    for k, (x, y) in enumerate(RIVER):
        x2, y2 = RIVER[min(k + 1, len(RIVER) - 1)]
        x1, y1 = RIVER[max(k - 1, 0)]
        dx, dy = x2 - x1, y2 - y1
        n = hypot(dx, dy) or 1
        wv = 9 + 3 * noise.noise(Vector((x / 40, y / 40, 9.1)))
        for side in (-1, 1):
            px, py = x - dy / n * wv * side, y + dx / n * wv * side
            verts.append(tuple(world(px, py, -0.012)))
    for k in range(len(RIVER) - 1):
        a = 2 * k
        faces.append((a, a + 1, a + 3, a + 2))
    mesh_object("río", verts, faces, water)


def pools(n, count, spread, color):
    """Charcas (marjal) en el área de un nodo."""
    mat = material(f"charca {n['id']}", color, rough=0.3)
    made = 0
    for _ in range(200):
        if made >= count:
            break
        a, d = rng.random() * 6.283, rng.uniform(62, spread)
        x, y = n["x"] + cos(a) * d, n["y"] + sin(a) * d * 0.8
        if not free(x, y, 6) or not (0 < x < W and 0 < y < H):
            continue
        r = rng.uniform(0.07, 0.13)
        bpy.ops.mesh.primitive_circle_add(vertices=10, radius=r, fill_type="NGON", location=world(x, y, height(x, y) + 0.004))
        o = bpy.context.object
        o.scale = (1, 0.7, 1)
        o.data.materials.append(mat)
        made += 1


def scatter(kit):
    for j in range(0, H, 12):
        for i in range(0, W, 12):
            x, y = i + rng.uniform(-5, 5), j + rng.uniform(-5, 5)
            if not free(x, y):
                continue
            h = height(x, y)
            if h > 0.2:
                continue
            kind = owner(x, y)["type"]
            p, cls = TREES[kind]
            # Pinos en las faldas de la cordillera.
            if h > 0.08:
                p, cls = 0.3, "pine"
            if rng.random() > p:
                continue
            if cls == "mixed":
                cls = rng.choice(["round", "round2", "pine"])
            elif cls == "round" and rng.random() < 0.4:
                cls = "round2"
            place(kit[cls], x, y, rng.uniform(1.2, 1.8))


def ring(kit, n, proto, count, rmin, rmax, scale=(0.9, 1.2), face=False):
    """Piezas alrededor de un nodo, fuera de su zona libre."""
    made = 0
    for _ in range(400):
        if made >= count:
            break
        a, d = rng.random() * 6.283, rng.uniform(rmin, rmax)
        x, y = n["x"] + cos(a) * d, n["y"] + sin(a) * d * 0.85
        if not (10 < x < W - 10 and 10 < y < H - 10) or not free(x, y, 4):
            continue
        # Las casas miran al nodo, como alrededor de una plaza.
        turn = -a + radians(90) if face else None
        place(kit[proto], x, y, rng.uniform(*scale), turn)
        made += 1


def decorate(kit):
    for n in NODES:
        t = n["type"]
        if t == "village":
            ring(kit, n, "house", 9, 64, 115, (1.4, 1.8), face=True)
        elif t == "castle":
            ring(kit, n, "house", 4, 64, 100, (1.4, 1.8), face=True)
        elif t == "ruins":
            ring(kit, n, "column", 8, 62, 105, (1.1, 1.9))
            ring(kit, n, "block", 10, 62, 110, (1.2, 2.0))
        elif t == "shrine":
            ring(kit, n, "block", 5, 62, 90, (1.3, 1.8))
        elif t in ("den", "lair"):
            ring(kit, n, "spike", 14 if t == "lair" else 10, 62, 115, (1.0, 2.0))
        elif t == "bog":
            pools(n, 7, 120, (58, 92, 84))
        elif t == "ford":
            pools(n, 2, 90, (78, 128, 168))


def stage(res_y):
    s = bpy.context.scene
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    s.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "HORIZONTAL"
    cam.data.ortho_scale = W / U
    t = radians(TILT)
    centre = world(W / 2, H / 2, 0)
    # Desde el sur, inclinada TILT grados: el centro del suelo cae en el centro de la imagen.
    cam.location = centre + Vector((0, -sin(t), cos(t))) * 30
    cam.rotation_euler = (t, 0, 0)
    cam.data.clip_end = 100
    s.camera = cam

    sun = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN"))
    s.collection.objects.link(sun)
    sun.data.energy = 3.8
    sun.data.angle = radians(3)
    sun.data.color = (1.0, 0.95, 0.85)
    sun.rotation_euler = Vector((0.55, -0.35, -0.75)).normalized().to_track_quat("-Z", "Y").to_euler()

    world_ = bpy.data.worlds.new("cielo")
    world_.use_nodes = True
    world_.node_tree.nodes["Background"].inputs["Color"].default_value = (0.42, 0.48, 0.6, 1)
    world_.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    s.world = world_

    r = s.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y, r.resolution_percentage = RES_X, res_y, 100
    s.cycles.device = "CPU"
    s.cycles.samples = 48
    s.cycles.use_denoising = True
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"


def render(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # El suelo se ve aplastado por cos(TILT): se renderiza más bajo y luego se estira.
    res_y = round(RES_X * H / W * cos(radians(TILT)))
    stage(res_y)
    terrain()
    river()
    kit = protos()
    decorate(kit)
    scatter(kit)
    raw = path + ".raw.png"
    bpy.context.scene.render.filepath = raw
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(raw)
    img.scale(RES_X, round(RES_X * H / W))
    settings = bpy.context.scene.render.image_settings
    settings.file_format = "WEBP"
    settings.quality = 88
    img.save_render(path)
    os.remove(raw)
    print(f"escena: {path} ({img.size[0]}×{img.size[1]})")
