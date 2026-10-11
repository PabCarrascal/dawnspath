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
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, export_materials="EXPORT")
    print(f"modelo: {path}")
