# Arte con Blender MCP

Cómo conectar Blender a Claude Code y cómo convertir sus renders en los fondos y sprites de El Sendero del Alba.

Hoy cada escena se pinta por código en Canvas2D (`src/combat/view/backdrop.ts` y `src/campaign/view/props.ts`). La idea es sustituir esas capas por renders de Blender hechos con assets de Poly Haven a 2k, sin tocar el motor 2D.

## 1. Instalación

Requisitos: macOS con Homebrew y `uv` (`brew install uv`; en este equipo ya está).

1. **Blender.** Instálalo con:

   ```bash
   brew install --cask blender
   ```

   También vale la descarga de [blender.org](https://www.blender.org/download/). Usa la versión 3.6 o posterior.

2. **Complemento de Blender MCP.**
   1. Descarga `addon.py` del repositorio [ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp).
   2. En Blender, ve a *Edit → Preferences → Add-ons → Install…*, elige `addon.py` y activa **Interface: Blender MCP**.

3. **Conectar desde Blender.**
   1. En la vista 3D, pulsa `N` para abrir el panel lateral y entra en la pestaña **BlenderMCP**.
   2. Activa **Use assets from Poly Haven**.
   3. Pulsa **Connect to MCP server**. Blender queda escuchando en el puerto 9876.

4. **Registrar el servidor en Claude Code**, desde la carpeta del proyecto:

   ```bash
   claude mcp add blender -- uvx blender-mcp
   ```

   La primera vez, `uvx` descarga el paquete `blender-mcp`.

5. **Sesión nueva.** Empieza una sesión nueva de Claude Code o reinicia la actual para que carguen las herramientas de Blender.

**Comprobación:** con Blender abierto y conectado, pide a Claude "lista los objetos de la escena de Blender". Si responde con la escena por defecto (cubo, cámara y luz), todo funciona.

**Si no conecta:**

| Síntoma | Causa probable |
| --- | --- |
| Claude no ve herramientas de Blender | La sesión se abrió antes de `claude mcp add`; abre una nueva. |
| "Could not connect to Blender" | En Blender no se pulsó **Connect**, o se cerró Blender. |
| Poly Haven no devuelve nada | La casilla de Poly Haven no está activada en el panel. |
| Puerto ocupado | Otra instancia de Blender ya usa el 9876; cierra las demás. |

## 2. Estilo

La referencia es Darkest Dungeon: trazo de tinta, sombras duras, paleta corta y desaturada, y la luz como única fuente de color. Un render 3D realista no encaja; hay que llevarlo hacia la ilustración.

- **Contorno:** Freestyle activado (*Render Properties → Freestyle*), línea de 2–3 px, color casi negro `#0b0907`.
- **Sombreado:** plano. Usa *Shader to RGB* con una *Color Ramp* de 2–3 pasos, o el motor Workbench con iluminación *Flat* para las capas lejanas.
- **Texturas Poly Haven a 2k**, desaturadas entre un 40 % y un 60 % en el material.
- **Luz:** una principal (sol, luna o antorcha) más un relleno muy bajo. Nada de iluminación global brillante.
- **Hora del día:** por código. Cada fondo se renderiza una sola vez con luz neutra, y el juego lo colorea y oscurece según la hora (día, atardecer, noche). Así un bioma necesita un juego de capas en lugar de cuatro.

## 3. Qué hay que producir

### Fondos de bioma

Cada bioma se renderiza en capas separadas, todas en PNG con transparencia (RGBA) salvo el cielo:

| Capa | Archivo | Tamaño | Contenido |
| --- | --- | --- | --- |
| Cielo | `sky.png` | 1480 × 1420 | Degradado y nubes, sin sol ni luna (los pone el código). Opaco. |
| Lejana | `far.png` | 1480 × 720 | Montañas o línea de bosque lejana. |
| Media | `mid.png` | 1480 × 720 | Árboles, ruinas o estructuras de fondo; su base, en y = 582. |
| Suelo | `ground.png` | 1480 × 720 | El camino, desde y = 560 hacia abajo. |
| Primer plano | `front.png` | 1480 × 720 | Hierbas y ramas que enmarcan los bordes; el centro, libre. |

Cada capa se renderiza al doble de tamaño (2960 × 1440, o 2960 × 2840 para el cielo) y el juego la escala; así se ve nítida en pantallas retina.

- **Biomas:** `meadow`, `forest`, `ruins`, `ford`, `lair` y `castle`. Prioridad: `forest`, que es el del corte vertical.
- **Referencias de la escena lógica** (de 1280 × 720, ampliada a 1480 de ancho para el paralaje): el suelo de los personajes está en y = 568, y el grupo ocupa x = 134–560 y los enemigos x = 720–1146 (más 100 px de margen en las capas).
- **Cámara:** ortográfica, mirando de lado. Una cámara por capa, o una sola cámara ocultando colecciones entre renders.

### Estructuras y edificios

Cada pieza es un PNG RGBA con el origen en el centro de la base:

| Pieza | Archivo | Tamaño aproximado |
| --- | --- | --- |
| Herrería | `smithy.png` | 260 × 300 |
| Taberna | `tavern.png` | 300 × 340 |
| Logia de constructores | `lodge.png` | 320 × 320 |
| Murallas y torres del castillo | `castle-back.png` | 1480 × 720 (capa) |
| Campamento (tienda y hoguera) | `camp.png` | 220 × 160 |
| Torre de vigía | `tower.png` | 180 × 420 |
| Cofre de botín | `chest.png` | 80 × 60 |

Los edificios pueden llevar variantes por nivel (`smithy-1.png` … `smithy-3.png`); si no las hay, el código añade estandartes por nivel como ahora.

### Personajes

Los personajes, para más adelante. Animar renders 3D cuadro a cuadro no encaja con el movimiento por código (respiración, embestida, retroceso). Si se hacen en Blender, serán 2 o 3 poses por unidad en PNG RGBA de 512 × 512, con el origen en los pies.

## 4. Dónde van en el proyecto

```
public/art/
  biomes/<bioma>/sky.png, far.png, mid.png, ground.png, front.png
  props/smithy.png, tavern.png, lodge.png, castle-back.png, camp.png, tower.png, chest.png
art-src/
  <bioma>.blend           # escenas fuente (con Git LFS si pesan mucho)
```

- **Integración en el código:** `paintBackdrop` (en `backdrop.ts`) y `paintBuildings` y `paintNodeProps` (en `props.ts`) cargarán el PNG si existe y, si no, pintarán por código como ahora. Así se puede sustituir el arte por partes y el juego nunca se queda sin fondo.
- **Assets de Poly Haven:** tienen licencia CC0, así que se pueden usar en un juego publicado sin atribución. Aun así, conviene anotar en `art-src/CREDITS.md` qué assets se usan.

## 5. Flujo de trabajo con Claude

Con Blender conectado, un encargo típico es:

> Monta el bioma bosque: pinos y troncos de Poly Haven a 2k en tres profundidades, suelo de tierra con piedras, niebla baja. Cámara ortográfica lateral. Renderiza las capas far, mid, ground y front según `docs/blender.md` en `public/art/biomes/forest/`.

Después:

1. Claude comprueba los PNG (tamaño, transparencia y línea de suelo).
2. Si falta, activa en el código la carga de esas capas.
3. Lo verifica en el navegador con el juego en marcha.
4. Se ajusta el estilo (grosor del trazo, desaturación, contraste) y se repite.

Orden propuesto:

1. Bosque, que es el bioma del corte vertical.
2. Castillo y sus 3 edificios.
3. Campamento y torre.
4. El resto de biomas.
5. Personajes, si al final se hacen en 3D.
