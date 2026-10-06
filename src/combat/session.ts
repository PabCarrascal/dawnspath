import type { Application } from 'pixi.js';
import { audio } from '../audio/Audio';
import type { Combat } from './rules/Combat';
import type { CombatEvent } from './rules/types';
import { CombatUi } from './ui';
import type { TimeOfDay } from './view/backdrop';
import { CombatView } from './view/CombatView';

export type CombatOutcome = 'won' | 'lost' | 'fled';

export const NARRATOR = {
  start: [
    'La luz de la antorcha tiembla. Algo se mueve más allá.',
    'Hasta los valientes sienten el frío cuando cae la noche.',
    'El sendero no perdona a quien duda.',
  ],
  won: ['Por esta vez, la oscuridad retrocede.', 'Una pequeña victoria. Harán falta muchas más.'],
  lost: ['La noche se cobra lo que es suyo.', 'Ninguna leyenda empieza sin caídos.'],
  fled: ['Huir no es deshonra. Volver sin valor, sí.'],
};
export const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export interface SessionOptions {
  /** Aplicación Pixi compartida; si falta, se crea una nueva dentro de `stage`. */
  app?: Application;
  stage: HTMLElement;
  overlay: HTMLElement;
  combat: Combat;
  time: TimeOfDay;
  seed: number;
  /** Frase del narrador al empezar. */
  intro?: string;
}

export interface CombatSession {
  view: CombatView;
  ui: CombatUi;
  /** Se resuelve cuando el combate acaba y el narrador ha hablado. */
  done: Promise<CombatOutcome>;
  /** Retira la escena y la interfaz del combate. */
  dispose: () => void;
}

/**
 * Bucle de un combate jugable: turnos del jugador, selección de habilidad y
 * objetivo, reproducción de eventos. Lo usan el prototipo y la campaña.
 */
export async function startCombat(o: SessionOptions): Promise<CombatSession> {
  const { combat, time, seed } = o;
  let selected: string | null = null;
  let busy = true;
  let resolve!: (r: CombatOutcome) => void;
  const done = new Promise<CombatOutcome>((r) => (resolve = r));

  const hooks = { onHover: (fid: number | null) => hover(fid), onClick: (fid: number) => click(fid) };
  const view = o.app ? CombatView.mount(o.app, combat, time, seed, hooks) : await CombatView.create(o.stage, combat, time, seed, hooks);
  const ui = new CombatUi(o.overlay, combat, { onSkill: (sid) => choose(sid), onRetreat: () => retreat() });

  const uiHooks = {
    banner: (text: string, tone: 'bad' | 'good' | 'epic', sub?: string) => ui.banner(text, tone, sub),
    bark: (fid: number, text: string) => {
      const p = view.headOf(fid);
      ui.bark(p.x, p.y, text);
    },
    log: (text: string, tone?: 'bad' | 'good' | 'info') => ui.log(text, tone),
    round: (r: number, order: number[]) => ui.round(r, order),
    turn: (fid: number) => {
      ui.turn(fid);
      ui.showActor(combat.fighter(fid) ?? null);
    },
    sound: (name: string) => audio.play(name as Parameters<typeof audio.play>[0]),
  };

  const play = async (events: CombatEvent[]) => {
    busy = true;
    ui.setPlayerTurn(false);
    view.setTargets([], 'enemy');
    await view.play(events, uiHooks);
    busy = false;
    next();
  };

  /** Tras cada reproducción: turno del jugador o fin del combate. */
  const next = () => {
    const s = combat.state;
    if (s.phase === 'won' || s.phase === 'lost' || s.phase === 'fled') return void finish(s.phase);
    if (s.phase !== 'player') return;
    const actor = combat.active!;
    const usable = combat.skillsOf(actor.id).filter((x) => x.usable);
    // Por defecto, la primera habilidad que hace daño (como en Darkest Dungeon).
    selected = (usable.find((x) => x.skill.dmg) ?? usable[0])?.skill.id ?? null;
    ui.setPlayerTurn(true);
    ui.showActor(actor);
    refresh();
  };

  const refresh = () => {
    const actor = combat.active;
    if (!actor || combat.state.phase !== 'player') return;
    ui.showSkills(actor, selected);
    if (!selected) return view.setTargets([], 'enemy');
    const skill = combat.skill(selected);
    view.setTargets(combat.targets(actor.id, selected), skill.target.side === 'enemy' ? 'enemy' : 'ally');
  };

  const choose = (sid: string) => {
    if (busy || combat.state.phase !== 'player') return;
    const actor = combat.active!;
    if (!combat.skillsOf(actor.id).find((x) => x.skill.id === sid)?.usable) return;
    selected = sid;
    audio.play('click');
    // Las habilidades sobre uno mismo se lanzan sin elegir objetivo.
    if (combat.skill(sid).target.side === 'self') return click(actor.id);
    refresh();
  };

  const hover = (fid: number | null) => {
    const f = fid !== null ? combat.fighter(fid) : undefined;
    const actor = combat.active;
    if (!f || !f.alive) return ui.showTarget(null);
    const valid = !!actor && !!selected && combat.targets(actor.id, selected).includes(f.id);
    ui.showTarget(f, actor ?? undefined, selected ? combat.skill(selected) : undefined, valid && combat.state.phase === 'player');
  };

  const click = (fid: number) => {
    if (busy || combat.state.phase !== 'player' || !selected) return;
    const res = combat.act(selected, fid);
    if (!res.ok) {
      audio.play('error');
      return;
    }
    ui.showSkills(null, null);
    void play(res.events);
  };

  const retreat = () => {
    if (busy) return;
    const res = combat.retreat();
    if (res.ok) void play(res.events);
  };

  const onKey = (e: KeyboardEvent) => {
    const n = Number(e.key);
    const actor = combat.active;
    if (!actor || !n) return;
    const s = combat.skillsOf(actor.id)[n - 1];
    if (s) choose(s.skill.id);
  };
  window.addEventListener('keydown', onKey);

  const finish = (r: CombatOutcome) => {
    audio.play(r === 'won' ? 'victory' : r === 'lost' ? 'defeat' : 'bad');
    ui.narrate(pick(NARRATOR[r]));
    setTimeout(() => resolve(r), 1600);
  };

  const dispose = () => {
    window.removeEventListener('keydown', onKey);
    ui.destroy();
    view.destroy();
  };

  ui.narrate(o.intro ?? pick(NARRATOR.start));
  void (async () => {
    await new Promise((r) => setTimeout(r, 600));
    await play(combat.start());
  })();

  return { view, ui, done, dispose };
}
