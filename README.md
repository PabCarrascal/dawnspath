# El Sendero del Alba

Gestión de un castillo y expediciones cortas con combate por turnos, en 2D y con la estética de Darkest Dungeon. Mejoras el castillo, preparas al grupo y sus víveres, y avanzas por un sendero ramificado hasta el Heraldo de la Noche, el lugarteniente del Rey.

**Ganas** si vences al Heraldo. **Pierdes** si cae el héroe sin nadie que lo saque del combate.

Está en fase temprana: el corte vertical (fase 1) del [documento de diseño](https://claude.ai/code/artifact/8ca35d88-c574-4c82-b382-6e8fb4c8d4cd), con arte de relleno pintado por código.

## El juego

- **Castillo:** herrería (daño y protección), taberna (estrés y reclutas) y logia de constructores (campamentos y torres), con 3 mejoras cada una.
- **Expedición:** el héroe y hasta 3 soldados, con víveres y antorchas. Viajar y cada acción en un nodo gastan horas de luz.
- **Sendero:** 5 nodos con una bifurcación. En cada uno se puede explorar, saquear, construir y dejar soldados de guardia.
- **Noche:** en un campamento se cura; al raso sube el estrés, se come más y al día siguiente hay menos luz. Puede haber emboscada. Las guarniciones pueden caer y los nodos sin guardia vuelven a manos de las criaturas.
- **Combate:** 4 posiciones por bando, habilidades según la posición, estrés con virtudes y aflicciones, puertas de la muerte y muerte permanente.

## Cómo arrancarlo

```bash
npm install
npm run dev          # servidor de desarrollo en http://localhost:5173
npm test             # tests de las reglas (Vitest)
npm run build        # comprobación de tipos y build de producción en dist/
npm run sim          # un bot juega campañas enteras y resume el equilibrio
npm run sim:combat   # la IA juega ambos bandos de cada encuentro de prueba
```

| Página | Qué es |
| --- | --- |
| `/` | El juego. `?partida=nombre` usa otra ranura de guardado. |
| `/combat.html` | Banco de pruebas del combate. `?enc=skirmish\|patrol\|ambush&seed=123` |

## Arquitectura

```
src/
  core/       PRNG con semilla y animaciones con promesas
  audio/      música generativa y efectos sintetizados con WebAudio
  combat/     rules/ motor del combate, view/ escena PixiJS, session.ts bucle jugable
  campaign/   rules/ campaña y bot, view/ castillo, nodos y mapa, main.ts pantallas
```

- **Reglas sin gráficos.** `Combat` y `Campaign` reciben órdenes y devuelven eventos o registros. Las vistas los animan. Así se prueban y se equilibran con bots sin pantalla.
- **Partidas deterministas.** El azar sale de un PRNG con semilla que se guarda con la partida.
- **Escenas por capas.** Cada fondo se pinta en Canvas2D por capas (cielo, lejos, medio, suelo, primer plano) según el bioma y la hora, y PixiJS les da paralaje. Cuando haya arte definitivo, sustituirá a estas capas.

## Balance

- Campaña: [`src/campaign/rules/data.ts`](src/campaign/rules/data.ts).
- Combate: [`src/combat/rules/data.ts`](src/combat/rules/data.ts) y `BAL` en [`Combat.ts`](src/combat/rules/Combat.ts).

## Arte

Cómo conectar Blender MCP y producir fondos y sprites a partir de assets de Poly Haven: [`docs/blender.md`](docs/blender.md).

## Versiones anteriores

- El juego de castillo en 3D (Three.js) está en el historial de git, commit `59f2988`.
- La versión Phaser original está en [`legacy/index.html`](legacy/index.html).
