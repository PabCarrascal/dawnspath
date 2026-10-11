"""
Portada: amanece sobre el castillo del Alba.

Maqueta low-poly del castillo en su colina (la misma silueta que la portada
dibujada: torre del homenaje con chapitel y gallardete, dos torres, murallas
almenadas), colinas con árboles y montes al fondo. El cielo es el físico de
Blender: con solo subir el sol de bajo el horizonte a media mañana pasa de la
noche azul al rosa y naranja del alba. Las ventanas brillan de noche y se
apagan al hacerse de día.

Escribe <nombre>.webm y <nombre>.mp4 (el vídeo, FRAMES cuadros a FPS cuadros por
segundo, suavizado al reproducir) y <nombre>.webp (el último cuadro, para quien
prefiere menos movimiento).
"""

import os
import random
import subprocess
import tempfile
from math import cos, radians, sin

import bpy
from mathutils import Vector, noise

RES = (960, 540)
FRAMES = 36
FPS = 5
SAMPLES = 20
# Altura del sol (grados) al empezar y al acabar: poco por encima del horizonte, mientras dura el dorado.
SUN = (-3.0, 4.5)
# Hacia dónde sale el sol (0 = justo detrás del castillo, visto desde la cámara; + a la derecha).
SUN_AZIMUTH = 11

STONE = (0.44, 0.37, 0.3)
STONE_DARK = (0.2, 0.17, 0.15)
ROOF = (0.16, 0.2, 0.38)
GRASS = (0.12, 0.2, 0.08)
PINE = (0.05, 0.12, 0.07)
ROCK = (0.22, 0.21, 0.24)
BANNER = (0.6, 0.06, 0.04)
WINDOW = (1.0, 0.62, 0.22)

rng = random.Random(3)


def material(name, color, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.95
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = 0
    return m


def box(mat, loc, size, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    o.data.materials.append(mat)
    return o


def cone(mat, loc, r, depth, verts=4, rot_z=45):
    bpy.ops.mesh.primitive_cone_add(radius1=r, depth=depth, vertices=verts, location=loc, rotation=(0, 0, radians(rot_z)))
    o = bpy.context.object
    o.data.materials.append(mat)
    return o


def battlements(mat, x0, x1, y, z, depth, step=0.32):
    """Almenas a lo largo de x, en la cara de delante y la de detrás."""
    x = x0 + step / 2
    while x < x1:
        for dy in (-depth / 2, depth / 2):
            box(mat, (x, y + dy, z + 0.09), (step * 0.55, 0.12, 0.18))
        x += step


def tower(mat, roofmat, x, y, w, h, base):
    box(mat, (x, y, base + h / 2), (w, w, h))
    for dx in (-1, 1):
        for dy in (-1, 1):
            box(mat, (x + dx * w * 0.36, y + dy * w * 0.36, base + h + 0.1), (w * 0.24, w * 0.24, 0.2))
    return base + h


def castle(windows):
    stone = material("piedra", STONE)
    dark = material("piedra oscura", STONE_DARK)
    roof = material("tejado", ROOF)
    banner = material("gallardete", BANNER)
    base = 0.55
    # Murallas con almenas, las dos torres de los lados y la del homenaje en medio.
    box(stone, (0, 0, base + 0.75), (5.2, 0.9, 1.5))
    battlements(stone, -2.6, 2.6, 0, base + 1.5, 0.9)
    for x in (-2.85, 2.85):
        top = tower(stone, roof, x, 0, 1.0, 2.6, base)
    keep_top = tower(stone, roof, 0, 0.1, 1.5, 3.6, base)
    cone(roof, (0, 0.1, keep_top + 0.75), 1.1, 1.5)
    # Mástil y gallardete.
    box(dark, (0, 0.1, keep_top + 1.75), (0.05, 0.05, 0.7))
    box(banner, (0.28, 0.1, keep_top + 1.95), (0.5, 0.03, 0.22))
    # Puerta y ventanas (encendidas de noche).
    box(dark, (0, -0.47, base + 0.45), (0.8, 0.06, 0.9))
    for x, z, w, h in ((0, base + 2.6, 0.32, 0.45), (-2.85, base + 2.0, 0.22, 0.32), (2.85, base + 2.0, 0.22, 0.32),
                       (-1.3, base + 0.95, 0.22, 0.3), (1.3, base + 0.95, 0.22, 0.3), (0, base + 1.6, 0.26, 0.36)):
        y = -0.47 if abs(x) < 2 or z < base + 1.5 else -0.52
        if x == 0 and z > base + 2:
            y = -0.66
        box(windows, (x, y, z), (w, 0.06, h))


def hills():
    """Suelo ondulado: la colina del castillo, lomas alrededor y montes al fondo."""
    n = 120
    size = 80.0
    verts, faces = [], []
    for j in range(n + 1):
        for i in range(n + 1):
            x = (i / n - 0.5) * size
            y = (j / n - 0.15) * size
            z = 0.55 * max(0.0, 1 - (x * x + (y * 1.4) ** 2) / 30) ** 1.2
            z += 0.6 * noise.noise(Vector((x / 9, y / 9, 0.4))) + 0.25 * noise.noise(Vector((x / 3, y / 3, 2.1)))
            # Sierra al fondo.
            if y > 18:
                ridge = (y - 18) / 14
                z += min(1, ridge) * (5 + 4 * noise.noise(Vector((x / 7, 3.3, 0.0))) + 2.5 * abs(noise.noise(Vector((x / 2.5, 7.1, 0.0)))))
            verts.append((x, y, z if (abs(x) > 3.2 or not -1.2 < y < 1.2) else max(z, 0.55)))
    for j in range(n):
        for i in range(n):
            a = j * (n + 1) + i
            faces.append((a, a + 1, a + n + 2, a + n + 1))
    me = bpy.data.meshes.new("suelo")
    me.from_pydata(verts, [], faces)
    me.update()
    grass = material("hierba", GRASS)
    rock = material("roca", ROCK)
    me.materials.append(grass)
    me.materials.append(rock)
    for p in me.polygons:
        p.material_index = 1 if p.center.z > 2.2 else 0
    o = bpy.data.objects.new("suelo", me)
    bpy.context.scene.collection.objects.link(o)
    return verts, n, size


def ground_z(verts, n, size, x, y):
    i = round((x / size + 0.5) * n)
    j = round((y / size + 0.15) * n)
    i, j = max(0, min(n, i)), max(0, min(n, j))
    return verts[j * (n + 1) + i][2]


def path_x(y):
    """Centro del camino a la altura y (de -22, primer plano, a -0.6, la puerta)."""
    t = (y + 22) / 21.4
    return 1.6 * sin(t * 4.0) * (1 - t)


def trees(verts, n, size):
    pine = material("pino", PINE)
    trunk = material("tronco", (0.12, 0.08, 0.05))
    for _ in range(260):
        x, y = rng.uniform(-26, 26), rng.uniform(-6, 16)
        if abs(x) < 4.2 and -2 < y < 2.5:
            continue
        if -23 < y < 0 and abs(x - path_x(y)) < 1.8:
            continue
        # Más en los lados que delante del castillo.
        if abs(x) < 6 and y < -1 and rng.random() < 0.7:
            continue
        z = ground_z(verts, n, size, x, y)
        s = rng.uniform(0.6, 1.2)
        cone(pine, (x, y, z + 0.75 * s), 0.38 * s, 1.5 * s, verts=7, rot_z=rng.random() * 90)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.06 * s, depth=0.3 * s, vertices=5, location=(x, y, z + 0.1 * s))
        bpy.context.object.data.materials.append(trunk)


def path(verts, n, size):
    """Camino de tierra que sube desde primer plano hasta la puerta, algo serpenteante."""
    dirt = material("camino", (0.3, 0.22, 0.13))
    pts, faces = [], []
    steps = 40
    for k in range(steps + 1):
        t = k / steps
        y = -22 + t * 21.4
        x = path_x(y)
        w = 1.1 * (1 - t) + 0.45 * t
        for side in (-1, 1):
            px = x + side * w
            pts.append((px, y, ground_z(verts, n, size, px, y) + 0.03))
    for k in range(steps):
        a = 2 * k
        faces.append((a, a + 1, a + 3, a + 2))
    me = bpy.data.meshes.new("camino")
    me.from_pydata(pts, [], faces)
    me.update()
    me.materials.append(dirt)
    o = bpy.data.objects.new("camino", me)
    bpy.context.scene.collection.objects.link(o)


def sky():
    w = bpy.data.worlds.new("cielo")
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = True
    sky.sun_size = radians(2.2)
    sky.sun_rotation = radians(SUN_AZIMUTH)
    sky.air_density = 1.0
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bpy.context.scene.world = w
    return sky, bg


def camera():
    s = bpy.context.scene
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    s.collection.objects.link(cam)
    cam.data.lens = 38
    cam.data.shift_y = 0.16
    cam.location = (0.6, -38.0, 5.2)
    cam.rotation_euler = (radians(86), 0, 0)
    s.camera = cam


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = SAMPLES
    s.cycles.use_denoising = True
    # La escena no cambia entre cuadros (solo el sol y las ventanas): se reutiliza.
    s.render.use_persistent_data = True
    s.render.resolution_x, s.render.resolution_y = RES
    s.render.resolution_percentage = 100
    s.view_settings.view_transform = "AgX"
    s.view_settings.exposure = -0.7
    for look in ("AgX - Punchy", "Punchy", "AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            s.view_settings.look = look
            break
        except TypeError:
            pass
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGB"
    windows = material("ventana", (0.05, 0.03, 0.02), emit=WINDOW)
    castle(windows)
    verts, n, size = hills()
    trees(verts, n, size)
    path(verts, n, size)
    camera()
    sky_node, bg = sky()
    return sky_node, bg, windows


def frame(state, t, path):
    """Cuadro en el momento t (0 = antes del alba, 1 = sol ya arriba)."""
    sky_node, bg, windows = state
    sky_node.sun_elevation = radians(SUN[0] + (SUN[1] - SUN[0]) * t)
    # De noche el cielo apenas alumbra: se compensa algo, y menos según amanece.
    bg.inputs["Strength"].default_value = 1.0 + 2.0 * (1 - t) ** 3
    bsdf = next(n for n in windows.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Emission Strength"].default_value = 6.0 * max(0.0, 1 - t * 1.6)
    s = bpy.context.scene
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)


def render(path):
    base = os.path.splitext(path)[0]
    state = setup()
    tmp = tempfile.mkdtemp()
    for f in range(FRAMES):
        frame(state, f / (FRAMES - 1), os.path.join(tmp, f"f{f:03d}.png"))
        print(f"escena: cuadro {f + 1}/{FRAMES}", flush=True)
    src = ["-framerate", str(FPS), "-i", os.path.join(tmp, "f%03d.png")]
    # Cuadros intermedios fundidos: el sol sube suave aunque se rendericen pocos.
    smooth = ["-vf", "minterpolate=fps=30:mi_mode=blend,format=yuv420p"]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, *smooth, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", base + ".webm"], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, *smooth, "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-movflags", "+faststart", base + ".mp4"], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(tmp, f"f{FRAMES - 1:03d}.png"), "-quality", "86", base + ".webp"], check=True)
    print(f"escena: {base}.webm/.mp4/.webp")
