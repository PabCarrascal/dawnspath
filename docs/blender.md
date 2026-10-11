# Sprites con Blender

Cómo se hacen en Blender los sprites de los personajes de El Sendero del Alba y cómo los usa el juego.

El estilo es HD-2D: personajes en pixel art dentro de maquetas 3D. Antes cada sprite se dibujaba por código en `src/hd2d/characters.ts`. Ahora cada personaje es un modelo 3D sencillo, hecho con primitivas, que Blender renderiza como una hoja de pixel art con el mismo formato, la misma paleta y el mismo acabado. El juego usa las de Blender por defecto; las dibujadas siguen ahí como respaldo.

- **Dónde está todo:** `tools/blender/`.
- **Dónde se renderiza:** Blender está instalado solo en rdtserver, con snap. `npm run assets` sube `tools/blender/` a una carpeta temporal del servidor, lanza allí `blender -b` (sin interfaz) por cada modelo y se trae los PNG. Cómo se accede por SSH: [rdtserver.md](rdtserver.md).

## Uso rápido

```bash
npm run assets               # renderiza los modelos que han cambiado
npm run assets -- --todo     # todos
npm run assets -- hero       # solo estos
```

Los PNG quedan en `public/sprites/<modelo>.png` y el juego los usa en todas partes: maquetas, retratos y combates, en la campaña, el banco de combate y la galería de maquetas.

- **Volver a los dibujados:** añade `?sprites=dibujados` a la URL. Sirve para comparar.
- **Si una hoja no carga:** ese personaje sale dibujado y queda un aviso en la consola. El juego nunca se queda sin sprite. Qué personaje usa qué modelo se decide en `BLENDER_SPRITES`, en `src/hd2d/characters.ts`.

## El mapa

El mapa del sendero también sale de Blender: `tools/blender/scenes/map.py` construye una maqueta low-poly del territorio y la renderiza en `public/scenes/map.webp`. El juego la pone de fondo y dibuja encima, en SVG, los nodos, caminos, nieblas y oscuridad; la rosa de los vientos, la cartela y los bordes quemados van en otra capa.

- **Datos:** salen del juego con `tools/blender/export-map.ts` (nodos, caminos, río y zonas de la cartela) a `scenes/map.json`. `npm run assets` lo lanza solo, y si cambian los datos el mapa se vuelve a renderizar.
- **Cámara:** mira desde el sur, inclinada 35°. El suelo se renderiza aplastado y luego se estira, así que cada punto del suelo cae en las mismas coordenadas que usa el juego y lo que tiene altura (montes, árboles, casas) sobresale hacia el norte.
- **Decorado:** cada nodo tiñe su región según su tipo y la decora a juego (bosque, casas, ruinas, charcas, pinchos). Nada se pone encima de nodos, caminos, río ni cartela.
- **Si la imagen no carga:** el juego pinta el pergamino por código, como antes.

Renderizarlo tarda un minuto y medio.

## Edificios

La herrería, la taberna y la logia del castillo, y las seis casas de las aldeas, son modelos 3D hechos en Blender (`tools/blender/models/<nombre>.py`) que se exportan a `public/models/<nombre>.glb` y que las maquetas cargan en lugar de las casas generadas por código. Las de aldea (`cottage_a` … `cottage_f`) salen de una misma pieza, `cottage()`, con opciones: paredes de yeso con entramado, tablas o piedra; teja o paja; piso volado; chimenea; postigos, jardineras, porche, cobertizo o leña.

- **Texturas y luz del juego:** los materiales que se llaman como una textura del juego (`bricks`, `planks`, `plaster`, `slate`, `roof`, `thatch`) toman esa textura al cargar, y `window` y `fire` se encienden de noche como el resto de ventanas y fuegos. Cada cara lleva la textura entera, como las cajas del juego.
- **Medidas:** metros, con el origen en el centro de la planta a ras de suelo y la fachada mirando a −Y en Blender (hacia la cámara en el juego). Cada edificio ocupa la misma planta que la casa a la que sustituye, así que la fragua, el andamio y las etiquetas siguen en su sitio.
- **Si un modelo no carga:** se queda la casa de siempre.
- Las piezas comunes (cajas, vigas, tejados a dos aguas, tejadillos) están en `tools/blender/modeling.py`.

## Árboles y rocas

Los árboles y las rocas de todas las maquetas también son modelos de Blender (`tools/blender/nature.py`, con una variante por archivo en `models/`): frondosos, pinos, sauces y árboles muertos con tres o dos variantes cada uno, y cuatro rocas (dos planas).

- **Lo que pone el juego:** la corteza, el color de las hojas de cada bioma (verde, otoño, dorado, nevado), la piedra de cada bioma y la nieve de las rocas nevadas. Las copas cuelgan de un nodo `crown`, que el juego mece con el viento como antes.
- **Variante:** se elige por la posición del árbol o la roca, no por azar, para que las maquetas se repartan igual que siempre.
- **Mientras cargan (o si faltan):** los árboles y rocas generados por código.

## La portada

La pantalla de carga muestra un amanecer sobre el castillo del Alba: `tools/blender/scenes/splash.py` renderiza 36 cuadros con el cielo físico de Blender (el sol sube de bajo el horizonte y las ventanas se apagan) y ffmpeg, en el servidor, los convierte en `public/scenes/splash.webm` y `.mp4`, fundiendo cuadros para que el movimiento sea suave. También deja el último cuadro en `splash.webp`.

- El vídeo se funde sobre la portada dibujada en cuanto empieza a reproducirse y se queda en el último cuadro. Si no carga, se ve la dibujada.
- Con «reducir movimiento» activado en el sistema, solo se muestra el último cuadro.
- Renderizarlo tarda unos 15 minutos.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `tools/blender/run.sh` | Lo que ejecuta `npm run assets`: sube, renderiza en el servidor y trae los PNG. |
| `tools/blender/build.py` | Entrada de Blender: carga un modelo y genera su hoja. |
| `tools/blender/pixelart.py` | La tubería común: piezas, poses, render y acabado. |
| `tools/blender/palette.py` | La paleta `C` de `characters.ts`, en rampas de tres tonos. Si cambia una, hay que cambiar la otra. |
| `tools/blender/sprites/<modelo>.py` | Un archivo por personaje. |
| `tools/blender/scenes/splash.py` | El amanecer de la portada (vídeo). |
| `tools/blender/models/<nombre>.py` | Modelos 3D (GLB): edificios del castillo, casas de aldea, árboles y rocas; piezas comunes en `modeling.py` y `nature.py`. |
| `tools/blender/scenes/map.py` | La escena del mapa del sendero; sus datos, en `scenes/map.json` (de `export-map.ts`). |

## Cómo se renderiza una hoja

Cada hoja tiene 4 cuadros en fila, como las dibujadas: reposo, reposo un píxel más bajo, golpe y dolor. Va a doble resolución y con los pies en la última fila.

1. **Pose.** El modelo coloca sus piezas para el cuadro.
2. **Dos renders** con la misma cámara ortográfica, algo elevada y con el modelo girado hacia ella (vista de 3/4):
   - Workbench plano y sin suavizado: el color base de cada píxel y la silueta.
   - Cycles con todo en blanco y un sol desde la cámara, arriba a la izquierda: cuánta luz le llega a cada píxel.
3. **Tonos.** La luz se reduce a los tres tonos de la rampa de cada material (luz, base y sombra), como en la paleta del juego. Se limpian las motas sueltas.
4. **Detalles a mano**, como en `DETAIL` de `characters.ts`:
   - Tramas (cota de malla).
   - Ojos: el ojo dibujado del juego, estampado donde cae la pieza del ojo.
5. **Acabado**, copia de `finish()` y `selOut()`:
   - Borde de luz arriba a la izquierda y de sombra abajo a la derecha.
   - Trama en las telas.
   - Contorno que toma el color del vecino.
6. **Luces.** Las rayas del halo de un farol o una gema se pintan al final, sin contorno.

## Hacer un personaje nuevo

Copia uno parecido de `sprites/` (`hero.py` es la referencia) y cambia las piezas. Lo que define un modelo:

| Nombre | Qué es |
| --- | --- |
| `SIZE` | Tamaño del cuadro en la rejilla base, como `SPRITE_SIZE`. El alto debe coincidir con el dibujado. El ancho puede crecer si el ataque necesita sitio. |
| `VIEW` | Alto visible en unidades de Blender: `SIZE[1] / 20`, para que todos tengan la misma escala. |
| `TURN` | Grados que el modelo se gira hacia la cámara; por defecto, 35. |
| `build(rig)` | Crea los pivotes y las piezas. |
| `pose(rig, f)` | Coloca el cuadro `f` (de 0 a 3), normalmente con `rig.pose(giros, alturas, ocultos)`: grados por pivote, desplazamiento vertical por pivote y pivotes que no salen en ese cuadro. |

**Piezas.** Se añaden con `rig.part(tipo, pivote, posición, tamaño, color, rot=…, mark=…)`:

- **Tipos:** `box`, `ball`, `tube`, `cone`, `wedge`, `frustum` (cilindro que se estrecha) y `pleats` (capa con pliegues).
- **Color:** una rampa de `palette.py`.
- **Marcas:** `"mail"` (cota de malla), `"eye"` (ojo dibujado) y `"glow"` (halo de luz).

**Poses.** El personaje mira hacia +X. Un giro positivo de un pivote lo inclina hacia delante.

Para que el juego use el nuevo modelo, añádelo a `BLENDER_SPRITES` en `src/hd2d/characters.ts`.

## Estado

| Personaje | Modelo |
| --- | --- |
| Héroe, lancero, arquera, capellana | Hechos |
| Sombra, bruto, acechador, heraldo, mímico | Hechos (el heraldo y el mímico solo salen en la campaña) |
| Aldeano, herrero, gallina | Hechos (solo salen en las maquetas) |

Los doce personajes de `SPRITE_SIZE` tienen modelo.
