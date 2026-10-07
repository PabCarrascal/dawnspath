import type { LogLine, Resources, SoldierKind } from './types';

/** Lo que un suceso puede hacer con la campaña. Lo implementa `Campaign`. */
export interface EventApi {
  chance(p: number): boolean;
  int(lo: number, hi: number): number;
  /** Estrés para todo el grupo (negativo: alivio). */
  stress(n: number): void;
  /** Cura una fracción de la vida máxima a todo el grupo. */
  heal(frac: number): void;
  /** Heridas para todo el grupo (nunca mata). */
  hurt(n: number): void;
  food(n: number): void;
  torches(n: number): void;
  bag(r: Partial<Resources>): void;
  gold(): number;
  foodLeft(): number;
  hoursLeft(): number;
  /** Gasta horas de luz (sin bajar de 0). */
  hours(n: number): void;
  /** Un soldado nuevo: al grupo si cabe, si no al castillo. Devuelve dónde fue. */
  recruit(kind: Exclude<SoldierKind, 'hero'>, name: string): string;
  /** Combate inmediato en este nodo. */
  fight(foes: string[]): void;
  /** Revela los nodos vecinos y devuelve sus nombres. */
  reveal(): string[];
  dark(): boolean;
  /** Una oración más en la ermita del nodo. */
  extraPrayer(): void;
  /** Cambia el precio de los víveres de la aldea del nodo. */
  villagePrice(delta: number): void;
  /** El recluta de la aldea se ofrece gratis. */
  freeHire(): void;
}

export interface EventChoice {
  label: string;
  hint?: string;
  /** Motivo por el que no se puede elegir, o null. */
  can?: (api: EventApi) => string | null;
  run: (api: EventApi) => LogLine[];
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  /** Camino (al llegar a un nodo), aldea, aldea liberada o ermita. */
  where: 'road' | 'village' | 'liberated' | 'shrine';
  once?: boolean;
  when?: (api: EventApi) => boolean;
  choices: EventChoice[];
}

const good = (text: string): LogLine => ({ text, tone: 'good' });
const bad = (text: string): LogLine => ({ text, tone: 'bad' });
const info = (text: string): LogLine => ({ text, tone: 'info' });
const needGold = (n: number) => (a: EventApi) => (a.gold() >= n ? null : `Hacen falta ${n} de oro en la caravana.`);
const needHours = (n: number) => (a: EventApi) => (a.hoursLeft() >= n ? null : `Hacen falta ${n} horas de luz.`);
const needFood = (n: number) => (a: EventApi) => (a.foodLeft() >= n ? null : `Hacen falta ${n} víveres.`);

export const EVENTS: EventDef[] = [
  {
    id: 'herido',
    title: 'Un herido en el camino',
    text: 'Un hombre ensangrentado pide agua junto a la cuneta. Dice que las criaturas arrasaron su granja y que sabe manejar una lanza.',
    where: 'road',
    choices: [
      {
        label: 'Ayudarlo',
        hint: '−2 víveres',
        can: needFood(2),
        run: (a) => {
          a.food(-2);
          if (a.chance(0.65)) return [good(`Se recupera y pide unirse. Va ${a.recruit('spearman', 'Hugo el granjero')}.`)];
          a.fight(['shade', 'stalker']);
          return [bad('Era un cebo. Las sombras salen de la cuneta.')];
        },
      },
      { label: 'Seguir de largo', hint: '+6 estrés', run: (a) => (a.stress(6), [bad('Sus gritos os acompañan un buen rato.')]) },
    ],
  },
  {
    id: 'carro',
    title: 'Un carro volcado',
    text: 'Las ruedas aún giran. No hay nadie a la vista, ni rastro de los bueyes.',
    where: 'road',
    choices: [
      {
        label: 'Registrarlo',
        hint: '1 h',
        can: needHours(1),
        run: (a) => {
          a.hours(1);
          const gold = a.int(5, 15);
          a.bag({ materials: 4, gold });
          const lines = [good(`Tablones y clavos: 4 materiales y ${gold} de oro.`)];
          if (a.chance(0.3)) {
            a.stress(8);
            lines.push(bad('Algo se movía bajo la lona. Nadie quiere hablar de ello: +8 de estrés.'));
          }
          return lines;
        },
      },
      { label: 'Seguir', run: () => [info('Mejor no tentar a la suerte.')] },
    ],
  },
  {
    id: 'pozo',
    title: 'Un pozo de piedra',
    text: 'Agua clara al fondo de un pozo viejo. Huele a musgo… y a algo más.',
    where: 'road',
    choices: [
      {
        label: 'Beber',
        run: (a) => {
          if (a.chance(0.75)) {
            a.heal(0.15);
            a.stress(-5);
            return [good('Agua fresca: el grupo se cura algo y respira.')];
          }
          a.hurt(4);
          a.stress(6);
          return [bad('Estaba envenenada. Retortijones y fiebre para todos.')];
        },
      },
      { label: 'Llenar los odres', hint: '+2 víveres', run: (a) => (a.food(2), [good('Dos raciones más de agua y pan remojado.')]) },
      { label: 'Seguir', run: () => [info('El pozo queda atrás.')] },
    ],
  },
  {
    id: 'mercader',
    title: 'Un mercader errante',
    text: 'Un buhonero con una mula flaca. Cobra caro, pero en estos caminos nadie más vende nada.',
    where: 'road',
    choices: [
      { label: 'Comprar 4 víveres', hint: '16 oro', can: needGold(16), run: (a) => (a.bag({ gold: -16 }), a.food(4), [good('Cuatro raciones para el camino.')]) },
      { label: 'Comprar 2 antorchas', hint: '12 oro', can: needGold(12), run: (a) => (a.bag({ gold: -12 }), a.torches(2), [good('Dos antorchas de brea.')]) },
      { label: 'Despedirlo', run: () => [info('La mula se aleja cojeando.')] },
    ],
  },
  {
    id: 'susurros',
    title: 'Susurros en la niebla',
    text: 'Unas voces llaman a cada soldado por su nombre. Suenan a madres, a hermanos, a muertos.',
    where: 'road',
    when: (a) => a.dark() || a.chance(0.4),
    choices: [
      {
        label: 'Taparse los oídos y avanzar',
        hint: '1 h',
        run: (a) => {
          if (a.hoursLeft() >= 1) {
            a.hours(1);
            return [info('Avanzáis despacio, sin mirar atrás.')];
          }
          a.stress(4);
          return [bad('Sin luz para rodear la niebla: +4 de estrés.')];
        },
      },
      {
        label: 'Seguir las voces',
        run: (a) => {
          if (a.chance(0.5)) {
            const gold = a.int(25, 45);
            a.bag({ gold });
            return [good(`Llevan a un altar olvidado con ofrendas: ${gold} de oro.`)];
          }
          a.stress(15);
          return [bad('Las voces se ríen. Nadie duerme bien esta noche: +15 de estrés.')];
        },
      },
    ],
  },
  {
    id: 'fosa',
    title: 'Una fosa común',
    text: 'Aldeanos sin enterrar a un lado del camino. Algunos aún llevan sus bolsas.',
    where: 'road',
    choices: [
      { label: 'Darles sepultura', hint: '2 h', can: needHours(2), run: (a) => (a.hours(2), a.stress(-10), [good('Una oración y tierra encima. El grupo se siente algo mejor.')]) },
      { label: 'Registrar las bolsas', hint: '+20 oro, +10 estrés', run: (a) => (a.bag({ gold: 20 }), a.stress(10), [bad('20 de oro y miradas que nadie sostiene.')]) },
      { label: 'Seguir', run: () => [info('Pasáis en silencio.')] },
    ],
  },
  {
    id: 'cuervos',
    title: 'Cuervos que observan',
    text: 'Una bandada sigue al grupo en silencio, de rama en rama, como si supiera adónde vais.',
    where: 'road',
    choices: [
      {
        label: 'Seguirlos',
        hint: '1 h',
        can: needHours(1),
        run: (a) => {
          a.hours(1);
          const seen = a.reveal();
          return [good(seen.length ? `Desde una loma veis los alrededores: ${seen.join(', ')}.` : 'Os llevan a una loma, pero ya conocíais todo lo que se ve.')];
        },
      },
      { label: 'Espantarlos', run: (a) => (a.stress(-3), [good('Piedras y risas. El grupo se anima un poco.')]) },
    ],
  },
  {
    id: 'tormenta',
    title: 'Se acerca una tormenta',
    text: 'El cielo se cierra de golpe. Truenos al norte.',
    where: 'road',
    choices: [
      { label: 'Refugiarse', hint: '2 h', run: (a) => (a.hours(Math.min(2, a.hoursLeft())), [info('Esperáis bajo una roca a que escampe.')]) },
      {
        label: 'Seguir bajo la lluvia',
        hint: '+8 estrés',
        run: (a) => {
          a.stress(8);
          if (a.foodLeft() > 0) {
            a.food(-1);
            return [bad('Calados hasta los huesos, y una ración echada a perder.')];
          }
          return [bad('Calados hasta los huesos.')];
        },
      },
    ],
  },
  {
    id: 'desertor',
    title: 'Un desertor',
    text: 'Una arquera del castillo, huida hace semanas, os sale al paso. Pide volver.',
    where: 'road',
    once: true,
    choices: [
      { label: 'Acogerla', hint: '+4 estrés', run: (a) => (a.stress(4), [good(`Nadie se fía del todo, pero tira bien. Va ${a.recruit('archer', 'Selma la desertora')}.`)]) },
      { label: 'Echarla', run: () => [info('Se pierde entre los árboles.')] },
    ],
  },
  {
    id: 'brillo',
    title: 'Algo brilla en el barro',
    text: 'Un destello metálico entre el lodo, junto a unas huellas que no son de nadie del grupo.',
    where: 'road',
    choices: [
      {
        label: 'Recogerlo',
        run: (a) => {
          if (a.chance(0.7)) {
            const gold = a.int(20, 35);
            a.bag({ gold });
            return [good(`Un broche de plata: ${gold} de oro.`)];
          }
          a.fight(['stalker', 'stalker']);
          return [bad('Era un cebo. Algo sale del barro.')];
        },
      },
      { label: 'Dejarlo', run: () => [info('Hay cosas que es mejor no tocar.')] },
    ],
  },
  {
    id: 'aldea',
    title: 'La aldea pide ayuda',
    text: 'El alcalde os cuenta que algo merodea por los graneros cada noche. Os paga por adelantado si os quedáis a esperarlo.',
    where: 'village',
    choices: [
      {
        label: 'Montar guardia',
        hint: '+20 oro, +3 víveres, combate',
        run: (a) => {
          a.bag({ gold: 20 });
          a.food(3);
          a.fight(['shade', 'stalker']);
          return [info('Al caer la tarde, algo salta la cerca.')];
        },
      },
      { label: 'No podemos', hint: 'víveres más caros aquí', run: (a) => (a.villagePrice(1), a.stress(4), [bad('Os miran marchar. Los precios suben para vosotros.')]) },
    ],
  },
  {
    id: 'liberada',
    title: 'La aldea, libre',
    text: 'Los aldeanos salen de sus casas, todavía sin creérselo. El molinero os ofrece lo poco que les queda.',
    where: 'liberated',
    choices: [
      { label: 'Aceptar su gratitud', hint: '+4 víveres, +15 oro', run: (a) => (a.food(4), a.bag({ gold: 15 }), [good('Pan, harina y unas monedas.')]) },
      { label: 'Que lo guarden', hint: 'su recluta se une gratis', run: (a) => (a.freeHire(), a.stress(-6), [good('Se os unirá quien quiera, sin pedir nada a cambio.')]) },
    ],
  },
  {
    id: 'ermitano',
    title: 'El ermitaño',
    text: 'Un anciano ciego ha vuelto a encender la llama de la ermita. Dice que os esperaba.',
    where: 'shrine',
    choices: [
      { label: 'Escuchar sus historias', hint: '−12 estrés', run: (a) => (a.stress(-12), [good('Historias del primer alba. El grupo duerme mejor solo de pensarlo.')]) },
      { label: 'Donar 10 de oro', hint: '+1 rezo en la ermita', can: needGold(10), run: (a) => (a.bag({ gold: -10 }), a.extraPrayer(), [good('La llama arde más alta.')]) },
    ],
  },
];

export const EVENT = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<string, EventDef>;
