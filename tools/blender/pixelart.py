"""
Hojas de sprites en pixel art a partir de modelos low-poly hechos con primitivas.

Cada cuadro se renderiza dos veces con la misma cámara ortográfica:
  1. Workbench plano y sin suavizado: el color base de cada píxel y la silueta.
  2. Cycles con todo en blanco y un sol arriba a la izquierda: cuánta luz le llega.
Después la luz se reduce a pocos tonos (los tres de cada material, como en la
paleta de characters.ts) y se aplican las mismas pasadas de acabado que el
dibujo por código: borde de luz arriba a la izquierda, de sombra abajo a la
derecha, y contorno selectivo. La hoja sigue su formato: FRAMES cuadros en
fila, a doble resolución y con los pies en la última fila.
"""

import os
import tempfile
from math import cos, radians, sin

import bpy
import numpy as np
from mathutils import Matrix, Vector
from palette import NO_GRAIN

FRAMES = 4
SPRITE_RES = 2
OUTLINE = 0x1A1220
SHADOW = 0x0A0614
LIGHT = 0xFFF6E0
# Tonos según la luz (lineal) que recibe el píxel: (hasta, mezclar hacia, cuánto).
# El ambiente da AMBIENT y el sol de frente suma ~0,8: lo que mira a la cámara
# queda en el tono base, lo que mira arriba a la izquierda en el de luz y lo que
# le da la espalda al sol en el de sombra (la sombra honda, solo en huecos).
BANDS = [(0.2, SHADOW, 0.5), (0.58, SHADOW, 0.25), (0.97, None, 0.0), (9.9, LIGHT, 0.22)]
# Grados que la cámara mira hacia abajo.
ELEVATION = 12
# Grados que el modelo (que mira hacia +X) se gira hacia la cámara: vista de 3/4, como los dibujados.
TURN = 35
# Luz ambiente, sumada aparte: renderizada metería ruido justo en los umbrales.
AMBIENT = 0.26
# Hacia dónde viaja la luz: desde la cámara, arriba a la izquierda.
SUN = Vector((0.4, 0.75, -0.55)).normalized()


def rgb(c):
    return np.array([(c >> 16) & 255, (c >> 8) & 255, c & 255], dtype=np.float32) / 255


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _op(add, **kw):
    add(**kw)
    return bpy.context.object


def _wedge():
    """Caja que se estrecha hacia arriba (faldones)."""
    o = _op(bpy.ops.mesh.primitive_cone_add, radius1=0.7071, radius2=0.7071 * 0.6, depth=1, vertices=4)
    o.data.transform(Matrix.Rotation(radians(45), 4, "Z"))
    return o


def _pleats(folds=8, taper=0.75, depth=0.3, span=140):
    """Capa: un arco de `span` grados por detrás (x < 0), con pliegues verticales que se cierran hacia arriba."""
    verts = []
    for z, r, d in ((-0.5, 0.5, depth), (0.5, 0.5 * taper, depth * 0.3)):
        for i in range(folds + 1):
            a = radians(180 - span / 2 + span * i / folds)
            rr = r * (1 - d * (i % 2))
            verts.append((rr * cos(a), rr * sin(a), z))
    n = folds + 1
    faces = [(i, i + 1, n + i + 1, n + i) for i in range(folds)]
    mesh = bpy.data.meshes.new("pleats")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new("pleats", mesh)
    bpy.context.scene.collection.objects.link(o)
    return o


ADD = {
    "box": lambda: _op(bpy.ops.mesh.primitive_cube_add, size=1),
    "ball": lambda: _op(bpy.ops.mesh.primitive_uv_sphere_add, radius=0.5, segments=12, ring_count=8),
    "tube": lambda: _op(bpy.ops.mesh.primitive_cylinder_add, radius=0.5, depth=1, vertices=12),
    "cone": lambda: _op(bpy.ops.mesh.primitive_cone_add, radius1=0.5, radius2=0, depth=1, vertices=10),
    # Tronco de cono: la tapa de arriba mide `taper` veces la de abajo (hábitos, faldas).
    "frustum": lambda taper=0.6: _op(bpy.ops.mesh.primitive_cone_add, radius1=0.5, radius2=0.5 * taper, depth=1, vertices=14),
    "wedge": _wedge,
    "pleats": _pleats,
}


def _mail(y, x):
    """Cota de malla: rombos de un píxel, en filas alternas y desplazados en cada una (recolor(…, 2, 1))."""
    return (y % 2 == 0) & ((x + y // 2) % 2 == 0)


# Tramas que se pintan encima de las piezas marcadas, en coordenadas de pantalla
# (como DETAIL en characters.ts): (qué píxeles, cuánto se oscurecen).
PATTERNS = {"mail": (_mail, 0.14)}


def _eye(put, cx, cy):
    """Como eyes() de characters.ts: blanco, pupila mirando a la derecha, brillo y ceja."""
    x, y = round(cx - 0.5), round(cy - 1.5)
    for j in range(4):
        for i in range(-1, 2):
            put(x + i, y + j, 0xF6F0E6)
    for j in range(1, 4):
        for i in range(2):
            put(x + i, y + j, 0x2A1A24)
    put(x, y + 1, 0xFFFFFF)
    for i in range(-1, 3):
        put(x + i, y - 2, 0x6A3E22)


def _glow(put, x0, y0, x1, y1):
    """Como el halo del farol en characters.ts: rayas de luz a los lados y encima."""
    for y in range(y0 + 1, y1):
        put(x0 - 3, y, 0xFFF2B0)
        put(x1 + 3, y, 0xFFF2B0)
    for x in range(x0 + 1, x1):
        put(x, y0 - 3, 0xFFF2B0)


# Piezas que marcan dónde pintar un detalle a mano tras el render: el 3D decide
# si se ven y dónde caen; el dibujo es el mismo que el del juego.
# "eye" estampa un ojo en el centro de la pieza y pasa por el acabado como el resto;
# "glow" rodea la pieza de rayas de luz al final, para que no les toque ni borde ni contorno.
DECALS = {"eye": _eye, "glow": _glow}
LIGHTS = {"glow"}
MARKS = [*PATTERNS, *DECALS]


class Rig:
    """Piezas colgadas de pivotes: posar es girar pivotes alrededor del eje Y (+ = hacia delante)."""

    def __init__(self):
        self.pivots = {}
        self.rest = {}
        self.mats = {}
        self.ramps = {}
        self.marks = {}
        # Peana que gira el modelo hacia la cámara; las poses no la tocan.
        self.stand = bpy.data.objects.new("stand", None)
        bpy.context.scene.collection.objects.link(self.stand)
        self.root = self.pivot("root", (0, 0, 0), None)
        self.root.parent = self.stand

    def pivot(self, name, loc, parent="root"):
        o = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(o)
        if parent:
            o.parent = self.pivots[parent]
        o.location = loc
        self.pivots[name] = o
        self.rest[name] = Vector(loc)
        return o

    def part(self, kind, parent, loc, size, color, rot=(0, 0, 0), mark=None, **shape):
        """
        Pieza de tamaño `size` (caja envolvente), en coordenadas de su pivote; `mark`
        le pone una trama de PATTERNS o un detalle de DECALS, y `shape` pasa opciones a la primitiva
        (taper del frustum; folds, taper, depth y span de pleats).
        """
        o = ADD[kind](**shape)
        o.parent = self.pivots[parent]
        o.location = loc
        o.rotation_euler = [radians(a) for a in rot]
        o.scale = size if isinstance(size, (tuple, list)) else (size, size, size)
        o.data.materials.append(self.material(color, mark))
        return o

    def material(self, c, mark=None):
        """`c` es un color o una rampa (luz, base, sombra); con rampa, los tonos salen de ella."""
        ramp = None
        if isinstance(c, (tuple, list)):
            ramp, c = c, c[1]
        if mark:
            # Las piezas marcadas se pintan en la pasada plana con un color casi igual que las
            # delata; luego toman los tonos de su rampa como las demás.
            c ^= 0x000008 * (1 + MARKS.index(mark))
            self.marks[c] = mark
        if c not in self.mats:
            m = bpy.data.materials.new(f"#{c:06x}")
            m.diffuse_color = (*to_linear(rgb(c)), 1)
            self.mats[c] = m
        if ramp:
            self.ramps[c] = ramp
        return self.mats[c]

    def pose(self, turns, lift=None, hide=()):
        """
        Gira cada pivote los grados indicados, desplaza en vertical los de `lift` y
        oculta los de `hide` con todo lo que cuelga de ellos (piezas de un solo cuadro).
        """
        lift = lift or {}
        for name, o in self.pivots.items():
            o.rotation_euler = (0, radians(turns.get(name, 0)), 0)
            o.location = self.rest[name] + Vector((0, 0, lift.get(name, 0)))
        hidden = {self.pivots[name] for name in hide}
        for o in bpy.context.scene.objects:
            p = o
            while p and p not in hidden:
                p = p.parent
            o.hide_render = p is not None
        bpy.context.view_layer.update()


def _white():
    m = bpy.data.materials.new("white")
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.8, 0.8, 0.8, 1)
    bsdf.inputs["Roughness"].default_value = 1
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0
    return m


def _stage(w, h, view):
    s = bpy.context.scene
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    s.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "VERTICAL"
    cam.data.ortho_scale = view
    # El suelo (z = 0) cae en el borde de la penúltima fila: la última queda para el contorno.
    e = radians(ELEVATION)
    zc = (view / 2 - view / h) / cos(e)
    cam.location = (0, -20 * cos(e), zc + 20 * sin(e))
    cam.rotation_euler = (radians(90) - e, 0, 0)
    s.camera = cam

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    s.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.data.angle = 0
    sun.rotation_euler = SUN.to_track_quat("-Z", "Y").to_euler()

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0, 0, 0, 1)
    s.world = world

    r = s.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
    r.film_transparent = True
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.display.render_aa = "OFF"
    s.display.shading.light = "FLAT"
    s.display.shading.color_type = "MATERIAL"
    s.cycles.device = "CPU"
    s.cycles.samples = 16
    s.cycles.use_denoising = False
    s.cycles.filter_width = 0.01


def _render(path, engine, override=None):
    s = bpy.context.scene
    s.render.engine = engine
    s.view_layers[0].material_override = override
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    shape = (img.size[1], img.size[0], 4)
    bpy.data.images.remove(img)
    return px.reshape(shape)


def _majority(band, flat):
    """Cada píxel toma el tono más repetido a su alrededor dentro del mismo material: quita motas sueltas."""
    h, w = band.shape
    key = np.round(flat[..., :3] * 255).astype(np.int32) @ np.array([65536, 256, 1])
    pb, pk = np.pad(band, 1, constant_values=-1), np.pad(key, 1, constant_values=-1)
    votes = np.zeros((len(BANDS), h, w), dtype=np.float32)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            b, k = pb[dy : dy + h, dx : dx + w], pk[dy : dy + h, dx : dx + w]
            for i in range(len(BANDS)):
                votes[i] += (b == i) & (k == key)
    # En caso de empate gana el tono que ya tenía.
    votes[band, np.arange(h)[:, None], np.arange(w)] += 0.5
    return votes.argmax(axis=0)


def _shade(flat, lit, ramps):
    """Color base de `flat` llevado a pocos tonos según la luz de `lit`."""
    out = np.zeros_like(flat)
    solid = flat[..., 3] > 0.5
    light = to_linear(lit[..., :3]) @ np.array([0.299, 0.587, 0.114], dtype=np.float32) + AMBIENT
    band = _majority(np.digitize(light, [b[0] for b in BANDS[:-1]]), flat)
    col = flat[..., :3].copy()
    loose = solid.copy()
    for base, (hi, mid, lo) in ramps.items():
        mine = solid & (np.abs(flat[..., :3] - rgb(base)).max(axis=-1) <= 2.5 / 255)
        for i, tone in enumerate([_mix(rgb(lo), rgb(SHADOW), 0.35), rgb(lo), rgb(mid), rgb(hi)]):
            col[mine & (band == i)] = tone
        loose &= ~mine
    for i, (_, target, amount) in enumerate(BANDS):
        if target is not None:
            sel = loose & (band == i)
            col[sel] = _mix(col[sel], rgb(target), amount)
    out[solid, :3] = col[solid]
    out[..., 3] = solid
    return out


def _blobs(mask):
    """Grupos de píxeles conectados de `mask`, como listas de (x, y)."""
    seen = np.zeros_like(mask)
    out = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        todo, blob = [(y0, x0)], []
        while todo:
            y, x = todo.pop()
            blob.append((x, y))
            for j, i in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= j < mask.shape[0] and 0 <= i < mask.shape[1] and mask[j, i] and not seen[j, i]:
                    seen[j, i] = True
                    todo.append((j, i))
        out.append(blob)
    return out


def _decals(img, flat, marks, light=False):
    """Pinta los detalles de DECALS (solo los de LIGHTS si `light`) donde han caído sus piezas."""
    # Vistas de arriba abajo, como el lienzo del juego.
    top, ftop = img[::-1], flat[::-1]
    h, w = top.shape[:2]

    def put(x, y, c):
        if 0 <= x < w and 0 <= y < h:
            top[y, x, :3] = rgb(c)
            top[y, x, 3] = 1

    for key, mark in marks.items():
        if mark not in DECALS or (mark in LIGHTS) != light:
            continue
        mask = (ftop[..., 3] > 0.5) & (np.abs(ftop[..., :3] - rgb(key)).max(axis=-1) <= 2.5 / 255)
        for blob in _blobs(mask):
            xs, ys = [p[0] for p in blob], [p[1] for p in blob]
            if mark == "eye":
                _eye(put, sum(xs) / len(xs), sum(ys) / len(ys))
            else:
                _glow(put, min(xs), min(ys), max(xs), max(ys))
    return img


def _patterns(img, flat, marks):
    """Pinta las tramas sobre los píxeles de las piezas marcadas."""
    h, w = img.shape[:2]
    # Filas contadas desde arriba, como en el lienzo del juego.
    y, x = np.mgrid[h - 1 : -1 : -1, 0:w]
    for key, mark in marks.items():
        if mark not in PATTERNS:
            continue
        which, amount = PATTERNS[mark]
        sel = (flat[..., 3] > 0.5) & (np.abs(flat[..., :3] - rgb(key)).max(axis=-1) <= 2.5 / 255) & which(y, x)
        img[sel, :3] = _mix(img[sel, :3], rgb(SHADOW), amount)
    return img


def _mix(a, b, t):
    return a * (1 - t) + b * t


def _at(a, dy, dx, fill=False):
    """`a` desplazada: en cada píxel, el valor del vecino (dy filas hacia arriba, dx columnas a la derecha)."""
    h, w = a.shape[:2]
    out = np.full_like(a, fill)
    ys, yd = (slice(dy, h), slice(0, h - dy)) if dy >= 0 else (slice(0, h + dy), slice(-dy, h))
    xs, xd = (slice(dx, w), slice(0, w - dx)) if dx >= 0 else (slice(0, w + dx), slice(-dx, w))
    out[yd, xd] = a[ys, xs]
    return out


# Las filas de Blender van de abajo arriba: "arriba" es la fila siguiente.
LEFT, RIGHT, UP, DOWN = (0, -1), (0, 1), (1, 0), (-1, 0)


def _finish(img):
    """
    Como finish() de characters.ts: luz en los bordes de arriba a la izquierda,
    sombra abajo a la derecha y, dentro, trama en las telas: un píxel algo más
    oscuro cada tanto donde los ocho vecinos son del mismo color.
    """
    h, w = img.shape[:2]
    solid = img[..., 3] > 0.5
    lit = solid & (~_at(solid, *LEFT) | ~_at(solid, *UP))
    dim = solid & ~lit & (~_at(solid, *RIGHT) | ~_at(solid, *DOWN))
    hexes = np.round(img[..., :3] * 255).astype(np.int32) @ np.array([65536, 256, 1])
    even = solid.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            even &= _at(solid, dy, dx) & (_at(hexes, dy, dx, fill=-1) == hexes)
    y, x = np.mgrid[h - 1 : -1 : -1, 0:w]
    grain = even & ~lit & ~dim & ~np.isin(hexes, list(NO_GRAIN)) & ((x * 7 + y * 13) % 9 == 0)
    img[lit, :3] = _mix(img[lit, :3], rgb(LIGHT), 0.22)
    img[dim, :3] = _mix(img[dim, :3], rgb(SHADOW), 0.2)
    img[grain, :3] = _mix(img[grain, :3], rgb(SHADOW), 0.1)
    return img


def _outline(img):
    """Como selOut() de characters.ts: el contorno toma el color del vecino, oscurecido."""
    solid = img[..., 3] > 0.5
    done = solid.copy()
    for d in (LEFT, RIGHT, UP, DOWN):
        sel = ~done & _at(solid, *d)
        near = _at(img, *d, fill=0)[sel, :3]
        img[sel, :3] = _mix(_mix(near, rgb(SHADOW), 0.7), rgb(OUTLINE), 0.5)
        img[sel, 3] = 1
        done |= sel
    return img


def _save(img, path):
    h, w = img.shape[:2]
    im = bpy.data.images.new("sheet", w, h, alpha=True)
    im.pixels.foreach_set(img.astype(np.float32).ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()


def sheet(model, path):
    """Renderiza `model` (SIZE, VIEW, build(rig), pose(rig, f) y opcional TURN) como hoja de sprites en `path`."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    w, h = (v * SPRITE_RES for v in model.SIZE)
    rig = Rig()
    model.build(rig)
    rig.stand.rotation_euler.z = radians(-getattr(model, "TURN", TURN))
    _stage(w, h, model.VIEW)
    white = _white()
    tmp = tempfile.mkdtemp()
    frames = []
    for f in range(FRAMES):
        model.pose(rig, f)
        flat = _render(os.path.join(tmp, f"flat{f}.png"), "BLENDER_WORKBENCH")
        lit = _render(os.path.join(tmp, f"lit{f}.png"), "CYCLES", white)
        img = _patterns(_shade(flat, lit, rig.ramps), flat, rig.marks)
        img = _outline(_finish(_decals(img, flat, rig.marks)))
        frames.append(_decals(img, flat, rig.marks, light=True))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    _save(np.concatenate(frames, axis=1), path)
    print(f"sprite: {path} ({w * FRAMES}×{h})")
