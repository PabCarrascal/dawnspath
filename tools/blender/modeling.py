"""
Modelos 3D para las maquetas del juego (edificios del castillo…), exportados a GLB.

Cada modelo (models/<nombre>.py) define build() con las piezas de aquí. La
convención que entiende el juego (Kit.model en src/hd2d/diorama/kit.ts):

- Metros = unidades del juego. El origen, en el centro de la planta y a ras de
  suelo; el frente del edificio mira a −Y (en el juego, +z: hacia la cámara).
- Los materiales que se llaman como una textura del juego (bricks, planks,
  plaster, slate, roof, thatch) se cambian por ella al cargar; window y fire,
  por la luz de las ventanas y del fuego, que se encienden de noche. El resto
  se queda con su color.
- Cada cara lleva la textura entera, como las cajas del juego.
"""

from math import atan2, degrees, hypot, radians

import bpy

# Colores solo para ver el modelo en Blender: en el juego, estas texturas las pone él.
COLORS = {
    "bricks": (0.55, 0.52, 0.5),
    "planks": (0.5, 0.34, 0.2),
    "plaster": (0.9, 0.85, 0.72),
    "slate": (0.3, 0.3, 0.38),
    "roof": (0.62, 0.26, 0.18),
    "thatch": (0.76, 0.62, 0.3),
    "window": (1.0, 0.75, 0.35),
    "fire": (1.0, 0.45, 0.15),
    "timber": (0.24, 0.15, 0.09),
    "iron": (0.16, 0.16, 0.18),
    "gold": (0.85, 0.65, 0.2),
    "stone": (0.62, 0.6, 0.56),
    "flowers": (0.86, 0.28, 0.34),
    "leaves": (0.28, 0.48, 0.2),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*COLORS.get(name, (0.8, 0.8, 0.8)), 1)
    bsdf.inputs["Roughness"].default_value = 0.9
    return m


def _finish(o, mat):
    o.data.materials.append(material(mat))
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def box(mat, size, loc, rot=(0, 0, 0)):
    """Caja de `size` (ancho x, fondo y, alto z) centrada en `loc`; `rot` en grados."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=tuple(radians(a) for a in rot))
    o = bpy.context.object
    o.scale = size
    return _finish(o, mat)


def beam(mat, a, b, thick=0.08):
    """Viga de sección cuadrada entre dos puntos del plano x–z (en la fachada, a la altura y de `a`)."""
    (x0, y, z0), (x1, _, z1) = a, b
    length = hypot(x1 - x0, z1 - z0)
    o = box(mat, (length, thick, thick), ((x0 + x1) / 2, y, (z0 + z1) / 2))
    o.rotation_euler.y = -atan2(z1 - z0, x1 - x0)
    return o


def cylinder(mat, r, h, loc, verts=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=loc, rotation=tuple(radians(a) for a in rot))
    return _finish(bpy.context.object, mat)


def gable(mat, length, span, rise, z, x=0.0, y=0.0, thick=0.08):
    """Tejado a dos aguas a lo largo de x: dos faldones con grosor que se juntan en la cumbrera."""
    slope = hypot(span / 2, rise)
    angle = degrees(atan2(rise, span / 2))
    # Cada faldón sube hacia la cumbrera (y = 0): el de delante gira a un lado y el de detrás al otro.
    for side in (-1, 1):
        box(mat, (length, slope, thick), (x, y + side * span / 4, z + rise / 2), rot=(-side * angle, 0, 0))
    # Hastiales: los triángulos de las dos puntas, para que el tejado no se vea hueco.
    for end in (-1, 1):
        verts = [(x + end * (length / 2 - 0.12), y - span / 2, z), (x + end * (length / 2 - 0.12), y + span / 2, z), (x + end * (length / 2 - 0.12), y, z + rise)]
        me = bpy.data.meshes.new("hastial")
        me.from_pydata(verts, [], [(0, 1, 2)])
        me.update()
        o = bpy.data.objects.new("hastial", me)
        bpy.context.scene.collection.objects.link(o)
        _finish(o, "timber")


def lean_to(mat, length, depth, z_back, z_front, x, y_back):
    """Tejadillo de una sola agua que baja hacia el frente (−y)."""
    angle = degrees(atan2(z_back - z_front, depth))
    slope = hypot(depth, z_back - z_front)
    box(mat, (length, slope, 0.07), (x, y_back - depth / 2, (z_back + z_front) / 2), rot=(angle, 0, 0))


def cottage(w, d, h, roof="roof", walls="plaster", frame=True, plinth=True, upper=False, chimney=None, door=0.0,
            windows=(-0.65, 0.65), shutters=False, flowers=False, porch=False, shed=None, logs=False):
    """
    Casa de aldea de planta w × d y paredes de alto h (hasta el alero), con el frente a −y.

    roof: "roof" (teja) o "thatch" (paja); walls: "plaster", "planks" o "bricks".
    frame: entramado de madera sobre el yeso; upper: el piso de arriba vuela sobre
    la calle; chimney: x de la chimenea (o None); door: x de la puerta; windows: x
    de las ventanas de abajo; shutters, flowers, porch: postigos, jardineras y
    tejadillo sobre la puerta; shed: lado (−1 izquierda, 1 derecha) de un cobertizo;
    logs: leña apilada contra la fachada.
    """
    front = -d / 2
    base = 0.22 if plinth else 0.0
    if plinth:
        box("stone", (w + 0.08, d + 0.08, base), (0, 0, base / 2))
    low = h if not upper else h * 0.5
    box(walls, (w, d, low - base), (0, 0, base + (low - base) / 2))
    top_front = front
    if upper:
        over = 0.12
        box(walls, (w + 2 * over, d + 2 * over, h - low), (0, 0, low + (h - low) / 2))
        top_front = front - over
        for x in (-w / 2 + 0.2, w / 2 - 0.2):
            box("timber", (0.1, 0.22, 0.1), (x, front - 0.06, low - 0.05))
    if frame and walls == "plaster":
        # Entramado: soleras, postes en las esquinas y en medio, y jabalcones bajo el alero (sin cruzar las ventanas).
        y = (top_front if upper else front) - 0.03
        z0 = low if upper else base
        span = h - z0
        for z in (z0 + 0.04, h - 0.04):
            box("timber", (w + (0.29 if upper else 0.05), 0.07, 0.08), (0, y, z))
        for x in (-w / 2 + 0.04, w / 2 - 0.04, 0.0):
            box("timber", (0.08, 0.07, span), (x, y, z0 + span / 2))
        if span > 0.9:
            for x, sx in ((-w / 2 + 0.04, 1), (w / 2 - 0.04, -1), (0.0, 1), (0.0, -1)):
                beam("timber", (x, y, h - 0.42), (x + sx * 0.36, y, h - 0.06), 0.07)
    # Tejado, más grueso y bajo si es de paja.
    thatch = roof == "thatch"
    gable(roof, w + (0.5 if thatch else 0.4), d + (0.8 if thatch else 0.55), d * (0.7 if thatch else 0.6), h - (0.08 if thatch else 0), thick=0.2 if thatch else 0.08)
    if chimney is not None:
        box("bricks", (0.32, 0.32, d * 0.75 + 0.5), (chimney, 0.2, h + (d * 0.75 + 0.5) / 2 - 0.1))
        box("stone", (0.4, 0.4, 0.08), (chimney, 0.2, h + d * 0.75 + 0.36))
    # Puerta con dintel, y ventanas (con postigos o jardineras).
    box("planks", (0.42, 0.06, 0.85), (door, front - 0.03, base + 0.42))
    box("timber", (0.52, 0.07, 0.08), (door, front - 0.04, base + 0.88))
    for x in windows:
        z = base + 0.55
        box("window", (0.3, 0.05, 0.3), (x, front - 0.02, z))
        box("timber", (0.38, 0.07, 0.05), (x, front - 0.04, z - 0.18))
        if shutters:
            for s in (-1, 1):
                box("planks", (0.12, 0.04, 0.32), (x + s * 0.22, front - 0.04, z))
        if flowers:
            box("planks", (0.36, 0.12, 0.08), (x, front - 0.09, z - 0.21))
            for k in (-1, 0, 1):
                box("flowers" if k else "leaves", (0.08, 0.08, 0.08), (x + k * 0.1, front - 0.1, z - 0.14))
    if upper:
        for x in windows:
            box("window", (0.26, 0.05, 0.3), (x, top_front - 0.02, low + (h - low) * 0.5))
    if porch:
        lean_to("roof" if not thatch else "planks", 0.8, 0.45, base + 1.15, base + 0.95, door, front)
        for s in (-1, 1):
            box("timber", (0.06, 0.06, base + 0.95), (door + s * 0.34, front - 0.42, (base + 0.95) / 2))
    if shed:
        sx = shed * (w / 2 + 0.3)
        box("planks", (0.6, d * 0.7, 0.75), (sx, 0.05, 0.375))
        box("planks", (0.7, d * 0.78, 0.06), (sx, 0.05, 0.8), rot=(0, shed * 12, 0))
    if logs:
        for k, (dx, z) in enumerate(((0.0, 0.08), (0.17, 0.08), (0.085, 0.22))):
            cylinder("planks", 0.08, 0.6, (-w / 2 + 0.45 + dx, front - 0.16, z), verts=7, rot=(0, 90, 0))


def export(path):
    """Cada cara con la textura entera y todo a GLB (y arriba, como three.js)."""
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        if not o.data.uv_layers:
            o.data.uv_layers.new()
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.reset()
        bpy.ops.object.mode_set(mode="OBJECT")
    # Con el color por vértice activo (el degradado de las copas de los árboles).
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, export_materials="EXPORT", export_vertex_color="ACTIVE")
    print(f"modelo: {path}")
