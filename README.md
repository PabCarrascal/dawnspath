# Rey del Amanecer

Estrategia y gestión de base en un diorama 3D low-poly. Levantas un castillo, haces crecer el reino edificio a edificio y exploras con tu héroe. Cada noche, las criaturas del Rey de la Noche asaltan todo lo que has construido.

**Ganas** si matas al Rey o si enciendes el Faro del Alba y resiste 3 noches. **Pierdes** si cae el héroe o el castillo.

## El reino

- **Castillo:** tiene cuatro niveles (Torreón, Fortaleza, Castillo y Ciudadela del Alba). Produce víveres y materiales, alista tropas y dispara de noche. Además define el territorio: cada nivel lo amplía, da más cuadrillas de obra y desbloquea edificios.
- **Recursos:** víveres, materiales, piedra y oro, más la población. Los habitantes trabajan en los edificios, pagan impuestos y son los que se alistan como tropas.
- **Edificios:** granja, aserradero, cantera, casa, torre, puesto de avanzada, puente, muralla, mercado, cuartel, arquería, herrería y Faro del Alba. Se colocan en tu territorio y tardan días en terminarse.
- **El mundo:** una isla hexagonal de radio 8 con puntos de interés:
  - **Ruinas:** recursos o una reliquia.
  - **Aldeas:** se anexionan y dan habitantes, oro y territorio.
  - **Santuarios:** bendición y curación.
  - **Guaridas de sombras:** engendran criaturas hasta que las destruyes.
- **La noche:** cada criatura ataca a su manera.
  - **Sombras:** cazan lo más cercano.
  - **Brutos:** asaltan edificios.
  - **El Rey:** marcha hacia tu castillo.

## Cómo arrancarlo

```bash
npm install
npm run dev      # servidor de desarrollo en http://localhost:5173
npm test         # tests de las reglas (Vitest)
npm run build    # comprobación de tipos y build de producción en dist/
npm run sim      # el bot juega partidas sin pantalla y resume el equilibrio
```

`npm run sim 100 normal` juega 100 partidas en Normal. El informe incluye:

- porcentaje de victorias y su causa
- día en que se alcanza cada nivel del castillo
- edificios destruidos por partida
- vida mínima del castillo y tamaño final del ejército

Parámetros de URL:

| Parámetro | Para qué sirve |
| --- | --- |
| `?seed=123` | Genera el mismo mundo. También acepta texto: `?seed=amanecer`. |
| `?difficulty=easy\|normal\|hard` | Elige la dificultad. |
| `?play=1` | Salta la pantalla de título. |

## Arquitectura

```
src/
  core/        hexágonos (coordenadas axiales), PRNG con semilla, ruido
  game/        reglas puras, sin Three.js: Game, mapgen, config (todo el balance)
  sim/         bot y simulador de partidas para equilibrar con datos
  render/      Three.js: World (cielo, luz, postpro), Board, Units, Particles, FogOfWar
  audio/       música generativa y efectos sintetizados con WebAudio
  ui/          HUD, minimapa, ajustes, iconos y estilos
  Controller   une todo: entrada → órdenes → eventos → animación
```

- **Reglas basadas en eventos.** `Game` recibe una orden (`move`, `attack`, `build`, `endDay`…), cambia el estado y devuelve una lista de eventos. El `Controller` los reproduce en orden con `async/await`. Así las reglas se prueban sin dibujar nada (`src/game/Game.test.ts`).
- **Partidas deterministas.** El mapa y el azar de la noche salen de un PRNG con semilla, y el guardado incluye el estado de ese PRNG. Cargar una partida reproduce exactamente las mismas noches.
- **Niebla de guerra en la GPU.** Una textura de visibilidad se muestrea en el shader de todos los materiales del tablero.
- **Tablero en pocas mallas.** Casillas y decoración se fusionan por material para reducir las llamadas de dibujo.
- **Cielo y luz.** El cielo es físico, el mapa de entorno se regenera según la hora y el sol avanza con cada hora de luz que gastas.

## Balance

Todos los números están en [`src/game/config.ts`](src/game/config.ts): terreno, unidades, construcciones, niveles del héroe, la noche y las tres dificultades.

## Original

La versión Phaser de la que nace este proyecto está en [`legacy/index.html`](legacy/index.html).
