import * as THREE from 'three';
import { audio } from './audio/Audio';
import { Hex, equals, fromWorld, key } from './core/hex';
import { BALANCE, BuildingKind, RecruitKind } from './game/config';
import { Game } from './game/Game';
import type { GameEvent, Result, Unit } from './game/types';
import { anim } from './render/anim';
import { Board } from './render/Board';
import { FogOfWar } from './render/FogOfWar';
import { HEX_SIZE, worldPos } from './render/layout';
import { setFowPatcher } from './render/materials';
import { Particles } from './render/Particles';
import { createSoftDot, createWaterNormalMap } from './render/textures';
import { Units } from './render/Units';
import { CLOCK, World } from './render/World';
import { clearSave, recordVictory, storeSave } from './storage';
import { BUILD_INFO, BUILD_ORDER, Hud } from './ui/Hud';
import { Minimap } from './ui/Minimap';
import { Settings, loadSettings, mountSettingsPanel, saveSettings } from './ui/settings';

type Mode = { kind: 'select' } | { kind: 'build'; building: BuildingKind };

const TERRAIN_NAMES = { plain: 'Llanura', forest: 'Bosque', mountain: 'Montaña', river: 'Río', ford: 'Vado' };

const POI_INFO = {
  ruins: {
    name: 'Ruinas',
    fresh: 'Pisa las ruinas para buscar materiales, víveres, piedra, oro o una reliquia.',
    used: 'Ya saqueadas.',
  },
  village: {
    name: 'Aldea',
    fresh: `Anexiónala pisándola: +${BALANCE.poi.village.settlers} habitantes, +${BALANCE.poi.village.gold} oro al día y territorio.`,
    used: `Parte del reino: +${BALANCE.poi.village.gold} oro al día y ${BALANCE.poi.village.housing} plazas.`,
  },
  shrine: {
    name: 'Santuario',
    fresh: `Su bendición da +${BALANCE.poi.shrine.blessing} PV y renombre. Quien duerma aquí cura ${BALANCE.poi.shrine.heal} PV.`,
    used: `Quien duerma aquí cura ${BALANCE.poi.shrine.heal} PV cada amanecer.`,
  },
};

const POI_COLORS = { ruins: 0xffd27a, village: 0xfff0c0, shrine: 0x8ff0ff };

const COLORS = {
  move: 0x48d6ff,
  attack: 0xff3b4a,
  danger: 0xff2a3a,
  build: 0xffc24a,
};

const BUILD_KEYS: Record<string, BuildingKind> = Object.fromEntries(
  BUILD_ORDER.filter((b) => b.key).map((b) => [b.key!, b.kind]),
);

/**
 * Orquesta el juego: traduce la entrada del jugador en órdenes para
 * `Game`, y reproduce los eventos resultantes en la escena 3D, el HUD y
 * el audio.
 */
export class Controller {
  game: Game;
  private world: World;
  private board: Board;
  private units: Units;
  private particles: Particles;
  private hud: Hud;
  private minimap: Minimap;
  private fow = new FogOfWar();
  private waterNormal: THREE.Texture;
  private settings: Settings;
  private settingsPanel: ReturnType<typeof mountSettingsPanel>;

  private mode: Mode = { kind: 'select' };
  private selectedId: number | null = null;
  private busy = false;
  private started = false;
  private pointer = { x: 0, y: 0, downX: 0, downY: 0, down: false, inside: false };
  private endangered = new Set<number>();
  /** Consejos ya mostrados en esta partida. */
  private advised = new Set<string>();
  private spaceHeld = false;

  constructor(container: HTMLElement, game: Game) {
    this.game = game;
    this.settings = loadSettings();
    this.waterNormal = createWaterNormalMap();
    this.world = new World(container, this.waterNormal);
    this.particles = new Particles(createSoftDot());
    this.particles.setViewport(this.world.bufferHeight, this.world.fov);
    this.world.onResize(() => this.particles.setViewport(this.world.bufferHeight, this.world.fov));

    // La niebla debe existir antes de crear cualquier material del tablero.
    setFowPatcher((m) => this.fow.patch(m));
    this.board = new Board(game.state.tiles, this.fow, this.waterNormal, this.particles);
    this.world.scene.add(this.board.root, this.particles.points);

    this.units = new Units(this.world, this.board, this.particles);
    this.world.scene.add(this.units.root);

    this.hud = new Hud({
      onBuild: (k) => this.onBuild(k),
      onCastle: () => this.toggleCastle(),
      onUpgrade: () => this.run(this.game.upgradeCastle()),
      onRecruit: (k) => this.recruit(k),
      onTrade: (i) => this.run(this.game.trade(i)),
      onEndDay: () => this.endDay(),
      onHelp: () => toggleHelp(),
      onSettings: () => this.settingsPanel.toggle(),
      onToggleThreat: () => this.toggleSetting('threat'),
      onToggleMute: () => this.toggleSetting('muted'),
    });
    this.minimap = new Minimap(this.hud.minimapSlot, game, (h) => {
      audio.play('click');
      this.world.focus(this.tileVec(h));
    });
    this.settingsPanel = mountSettingsPanel(this.settings, (s) => this.applySettings(s));

    this.populate();
    this.world.onUpdate((dt) => this.frame(dt));
    this.world.onSlow = () => {
      this.settings.quality = 'medium';
      saveSettings(this.settings);
      this.applySettings(this.settings);
      this.hud.log('Rendimiento bajo: calidad gráfica ajustada a Media.', 'info');
    };

    this.bindInput();
    this.applySettings(this.settings);
    // Luz de media mañana para la pantalla de título.
    this.world.clock = 0.11;
    this.world.start();
  }

  /** Sustituye la partida en curso por otra (nueva o cargada). */
  load(game: Game) {
    if (game === this.game) return;
    this.game = game;
    this.board.dispose();
    this.board = new Board(game.state.tiles, this.fow, this.waterNormal, this.particles);
    this.world.scene.add(this.board.root);
    this.units.clear();
    this.units.setBoard(this.board);
    this.hud.minimapSlot.innerHTML = '';
    this.minimap = new Minimap(this.hud.minimapSlot, game, (h) => this.world.focus(this.tileVec(h)));
    this.advised.clear();
    this.populate();
  }

  private populate() {
    for (const u of this.game.state.units) this.units.add(u);
    for (const t of this.game.state.tiles.values()) {
      if (!t.structure) continue;
      this.board.addStructure(t, t.structure, {
        work: t.work,
        total: t.workTotal,
        level: this.game.state.castle.level,
      });
      if (t.structure !== 'castle' && t.shp !== undefined) this.board.repaired(t, t.shp, this.game.structureMaxHp(t));
    }
    this.units.setKingAwake(this.game.state.kingAwake);
    this.syncUnitVisibility();
    this.board.rebuildTerritory();
    this.board.syncVision();
  }

  /** Arranca la partida tras la pantalla de título. */
  async begin(resumed = false) {
    this.started = true;
    audio.unlock();
    this.world.controls.autoRotate = false;
    this.hud.show(true);
    this.select(this.game.hero?.id ?? null);
    this.world.clock = this.dayClock();
    const castle = this.tileVec(this.game.state.castle);
    if (resumed) await this.world.focus(castle, 1200);
    else await this.world.setCameraHome(false, castle);
    this.refresh();
    const s = this.game.state;
    this.hud.banner(`Día ${s.day}`, resumed ? 'La leyenda continúa' : 'Haz crecer tu castillo y derrota a la noche', 2600);
    audio.play('dawn');
    if (!resumed) {
      this.hud.log('El torreón del alba se alza junto al héroe. Al noreste brilla la luz del Rey.', 'epic');
      this.advise(
        'start',
        'Tu castillo produce víveres y es el corazón del reino. Construye una granja (1) y un aserradero (2) en tu territorio dorado: las obras tardan días.',
      );
    }
    this.save();
  }

  private frame(dt: number) {
    const night = this.world.nightFactor;
    this.board.update(dt, night);
    this.board.ambient(dt, night);
    this.units.update(dt, night);
    this.particles.update(dt);
    audio.setNight(night);
    const t = this.world.controls.target;
    const off = this.world.camera.position.clone().sub(t);
    this.minimap.draw(dt, { x: t.x, z: t.z, yaw: Math.atan2(off.x, off.z) }, night);
    if (!this.started) {
      this.world.controls.autoRotate = true;
      this.world.controls.autoRotateSpeed = 0.35;
    }
  }

  // ───────────────────────── ajustes ─────────────────────────

  private applySettings(s: Settings) {
    audio.musicVolume = s.music;
    audio.sfxVolume = s.sfx;
    audio.muted = s.muted;
    audio.applyVolumes();
    if (this.world.quality !== s.quality) this.world.setQuality(s.quality);
    this.hud.setToggles(s.threat, s.muted);
    if (this.started) this.refresh();
  }

  private toggleSetting(k: 'threat' | 'muted') {
    this.settings[k] = !this.settings[k];
    saveSettings(this.settings);
    this.settingsPanel.sync();
    this.applySettings(this.settings);
    audio.play('click');
  }

  private advise(id: string, text: string) {
    if (!this.settings.tips || this.advised.has(id)) return;
    this.advised.add(id);
    this.hud.advise(text);
  }

  private save() {
    if (this.game.state.phase === 'day') storeSave(this.game.serialize());
  }

  // ───────────────────────── entrada ─────────────────────────

  private bindInput() {
    const canvas = this.world.renderer.domElement;
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    canvas.addEventListener('pointerdown', (e) => {
      this.pointer.down = true;
      this.pointer.downX = e.clientX;
      this.pointer.downY = e.clientY;
    });
    canvas.addEventListener('pointermove', (e) => {
      this.pointer.inside = true;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.updateHover();
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      this.board.setHover(null);
      this.hud.hideTip();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.pointer.down) return;
      this.pointer.down = false;
      const moved = Math.hypot(e.clientX - this.pointer.downX, e.clientY - this.pointer.downY);
      if (moved > 6) return;
      if (e.button === 0) this.onClick(e.clientX, e.clientY, e.shiftKey);
      if (e.button === 2) this.cancelMode();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('dblclick', () => this.focusSelected());

    window.addEventListener('keydown', (e) => {
      if (!this.started) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'enter') {
        e.preventDefault();
        if (this.busy) {
          this.spaceHeld = true;
          anim.speed = Math.max(anim.speed, 3);
        } else if (!e.repeat) this.endDay();
        return;
      }
      if (k === 'm') return this.toggleSetting('muted');
      if (k === 't') return this.toggleSetting('threat');
      if (k === 'h' || k === '?') return toggleHelp();
      if (k === 'escape') {
        document.getElementById('help')!.classList.remove('on');
        document.getElementById('settings')!.classList.remove('on');
        if (this.hud.isCastleOpen) this.hud.setCastleOpen(false);
        return this.cancelMode();
      }
      if (this.busy) return;
      if (k === 'c') this.toggleCastle();
      else if (BUILD_KEYS[k]) this.onBuild(BUILD_KEYS[k]);
      else if (k === 'f') this.focusSelected();
      else if (k === 'tab') {
        e.preventDefault();
        const ours = this.game.team('dawn');
        if (!ours.length) return;
        const i = ours.findIndex((u) => u.id === this.selectedId);
        const next = ours[(i + 1) % ours.length];
        this.select(next.id);
        audio.play('select');
        this.focusSelected();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        this.spaceHeld = false;
        anim.speed = this.busy && document.body.classList.contains('is-night') ? this.settings.nightSpeed : 1;
      }
    });
  }

  private focusSelected() {
    const p = this.selectedId !== null ? this.units.positionOf(this.selectedId) : null;
    if (p) this.world.focus(p);
  }

  private pickHex(x: number, y: number): { hex: Hex; unit: Unit | null } | null {
    const hit = this.world.pick(x, y, [...this.units.pickables, ...this.board.pickables]);
    if (!hit) return null;
    const id = this.units.idFromObject(hit.object);
    if (id !== null) {
      const u = this.game.unit(id);
      if (u && this.game.isUnitVisible(u)) return { hex: { q: u.q, r: u.r }, unit: u };
    }
    const hex = fromWorld(hit.point.x, hit.point.z, HEX_SIZE);
    if (!this.game.tile(hex)) return null;
    const u = this.game.unitAt(hex) ?? null;
    return { hex, unit: u && this.game.isUnitVisible(u) ? u : null };
  }

  private onClick(x: number, y: number, shift = false) {
    if (!this.started || this.busy || this.game.state.phase !== 'day') return;
    const picked = this.pickHex(x, y);
    if (!picked) return;
    const { hex, unit } = picked;
    const sel = this.selectedId !== null ? this.game.unit(this.selectedId) : undefined;

    if (this.mode.kind === 'build') {
      // Con mayúsculas se encadenan varias obras del mismo tipo.
      this.run(this.game.build(this.mode.building, hex), !shift);
      return;
    }

    if (equals(hex, this.game.state.castle)) {
      this.toggleCastle(true);
      return;
    }
    if (unit?.team === 'dawn') {
      if (unit.id !== this.selectedId) audio.play('select');
      this.select(unit.id);
      return;
    }
    if (!sel) return;
    if (unit?.team === 'night') {
      this.run(this.game.attack(sel.id, unit.id));
      return;
    }
    if (equals(hex, sel)) return;
    this.run(this.game.move(sel.id, hex));
  }

  private onBuild(kind: BuildingKind) {
    if (!this.started || this.busy || this.game.state.phase !== 'day') return;
    const err = this.game.canBuild(kind);
    if (err) return this.fail(err);
    const same = this.mode.kind === 'build' && this.mode.building === kind;
    this.mode = same ? { kind: 'select' } : { kind: 'build', building: kind };
    audio.play('click');
    this.refresh();
  }

  private toggleCastle(open?: boolean) {
    if (!this.started) return;
    const next = open ?? !this.hud.isCastleOpen;
    this.hud.setCastleOpen(next);
    audio.play('click');
    if (next) this.refresh();
  }

  private recruit(kind: RecruitKind) {
    this.run(this.game.recruit(kind));
  }

  private fail(reason: string) {
    audio.play('error');
    this.hud.log(reason, 'bad');
  }

  private cancelMode() {
    if (this.mode.kind === 'select') return;
    this.mode = { kind: 'select' };
    this.refresh();
  }

  private select(id: number | null) {
    this.selectedId = id;
    this.units.select(id);
    this.mode = { kind: 'select' };
    this.refresh();
  }

  private endDay() {
    if (!this.started || this.busy || this.game.state.phase !== 'day') return;
    this.mode = { kind: 'select' };
    this.run(this.game.endDay());
  }

  // ───────────────────────── estado visual ─────────────────────────

  private refresh() {
    const sel = this.selectedId !== null ? (this.game.unit(this.selectedId) ?? null) : null;
    if (this.selectedId !== null && !sel) {
      this.selectedId = null;
      this.units.select(null);
    }
    this.board.clearHighlights();
    this.board.showPath([]);
    const day = this.game.state.phase === 'day' && !this.busy;

    // Zona de amenaza: dónde podrán golpear las criaturas visibles esta noche.
    const threat = day ? this.game.threat() : { tiles: new Set<string>(), endangered: new Set<number>() };
    this.endangered = threat.endangered;
    this.units.setDanger(this.settings.threat ? threat.endangered : new Set());
    if (day && this.settings.threat && threat.tiles.size) {
      const hexes = [...threat.tiles].map((k) => this.game.state.tiles.get(k)!);
      this.board.highlight(hexes, COLORS.danger, 0.08, false, 'danger');
    }

    if (day && this.mode.kind === 'build') {
      const kind = this.mode.building;
      this.board.highlight(this.game.buildSpots(kind), COLORS.build, 0.4, true);
      this.hud.setModeHint(
        `${BALANCE.buildings[kind].name}: elige una casilla dorada · Mayús+clic para encadenar · Esc para cancelar`,
      );
    } else {
      this.hud.setModeHint(null);
      if (day && sel) {
        const reach = [...this.game.reachable(sel.id).keys()].map((k) => this.game.state.tiles.get(k)!);
        this.board.highlight(reach, COLORS.move, 0.07);
        this.board.highlight(reach, COLORS.move, 0.55, false, 'ring');
        this.board.highlight(this.game.attackTargets(sel.id), COLORS.attack, 0.45, true);
      }
    }
    const building = this.mode.kind === 'build' ? this.mode.building : null;
    this.hud.update(this.game, sel, building, this.settings.threat ? threat.endangered.size : 0);
    this.updateHover();
    if (day) this.checkAdvice();
  }

  /** Consejos contextuales, cada uno una sola vez por partida. */
  private checkAdvice() {
    const g = this.game;
    const s = g.state;
    const eco = g.economy();
    const tiles = [...s.tiles.values()];
    const has = (k: BuildingKind) => g.hasBuilding(k, true);
    if (s.day >= 2 && eco.production.food - eco.upkeep < 0)
      this.advise('food', 'Tus víveres bajan cada día. Construye granjas (1) en las llanuras de tu territorio.');
    if (s.day >= 2 && has('farm') && !has('sawmill'))
      this.advise('sawmill', 'Sin materiales no hay obras: levanta un aserradero (2) en un bosque de tu territorio.');
    if (s.day >= 3 && !has('quarry'))
      this.advise('quarry', 'La piedra hace falta para mejorar el castillo. Construye una cantera (3) junto a una montaña.');
    if (eco.understaffed.length)
      this.advise('workers', 'Hay edificios parados por falta de habitantes. Construye casas (4) para que crezca la población.');
    if (g.canUpgradeCastle() === null)
      this.advise('upgrade', 'Ya puedes mejorar el castillo (C): más territorio, cuadrillas, defensas y edificios nuevos.');
    if (tiles.some((t) => t.poi && !t.poiUsed && t.explored))
      this.advise('poi', 'Hay lugares por descubrir: el héroe puede saquear ruinas, anexionar aldeas y visitar santuarios.');
    if (g.team('night').some((u) => u.kind === 'lair' && g.isUnitVisible(u)))
      this.advise('lair', 'Una guarida de sombras: engendra criaturas cada noche. Destrúyela; no contraataca.');
    if (g.team('night').some((u) => (u.kind === 'shade' || u.kind === 'brute') && g.isUnitVisible(u)))
      this.advise('enemy', 'Las criaturas atacan unidades, edificios y el castillo. Torres y murallas ayudan, y el castillo también dispara.');
    if (this.endangered.size && this.settings.threat)
      this.advise('threat', 'Las casillas rojas marcan dónde pueden golpear las criaturas esta noche.');
    if (s.castle.hp < s.castle.maxHp * 0.5)
      this.advise('castle', '¡El castillo está dañado! Si cae, se pierde la partida. Se repara solo si no hay enemigos al lado.');
    if (!s.kingAwake && s.day === g.difficulty.kingWakeDay - 1)
      this.advise('king', 'El Rey despertará mañana por la noche. Reúne a tu ejército y refuerza las defensas.');
    if (s.castle.level === 4 && !has('beacon'))
      this.advise('beacon', 'La Ciudadela permite levantar el Faro del Alba: si resiste 3 noches encendido, ganas.');
  }

  private updateHover() {
    if (!this.started || !this.pointer.inside) return;
    const picked = this.pickHex(this.pointer.x, this.pointer.y);
    this.board.showPath([]);
    if (!picked) {
      this.board.setHover(null);
      this.hud.hideTip();
      return;
    }
    const { hex, unit } = picked;
    const tile = this.game.tile(hex)!;
    const sel = this.selectedId !== null ? this.game.unit(this.selectedId) : undefined;
    const lines: string[] = [];
    let color = 0xffffff;

    if (!tile.explored) {
      lines.push('<b>Tierra desconocida</b>');
    } else {
      lines.push(`<b>${TERRAIN_NAMES[tile.terrain]}</b>${tile.owned ? ' <span class="owned">· tu territorio</span>' : ''}`);
      const cost = this.game.moveCost(tile);
      if (tile.structure !== 'castle')
        lines.push(
          `<p>${cost === Infinity ? (tile.terrain === 'river' ? 'Necesita un puente' : 'Intransitable') : `Mover: ${cost} h`}</p>`,
        );
      if (tile.structure === 'castle') {
        const c = this.game.state.castle;
        lines.push(`<p class="tip-structure">${this.game.castleDef.name} · ${c.hp}/${c.maxHp} PV · clic para abrir</p>`);
      } else if (tile.structure) {
        const def = BALANCE.buildings[tile.structure];
        const unstaffed = this.game.economy().understaffed.includes(key(tile));
        const status = tile.work
          ? `en obras: ${tile.work} ${tile.work === 1 ? 'día' : 'días'}`
          : `${tile.shp ?? def.hp}/${def.hp} PV${unstaffed ? ' · <em>sin personal</em>' : ''}`;
        lines.push(`<p class="tip-structure">${def.name} · ${status}</p><p>${BUILD_INFO[tile.structure]}</p>`);
      }
      if (tile.poi) {
        const info = POI_INFO[tile.poi];
        lines.push(`<p class="tip-poi">${info.name} · ${tile.poiUsed ? info.used : info.fresh}</p>`);
      }
    }

    if (unit) {
      const b = BALANCE.units[unit.kind];
      const lvl = unit.kind === 'hero' ? ` · nivel ${unit.level ?? 1}` : '';
      lines.push(`<p class="tip-unit team-${unit.team}">${b.name}${lvl} · ${unit.hp}/${unit.maxHp} PV · ${unit.atk} ATQ</p>`);
      if (unit.kind === 'lair')
        lines.push(`<p>Engendra criaturas cada noche. No contraataca: destrúyela (+${b.reward} materiales).</p>`);
      else if (unit.team === 'night' && unit.kind !== 'king')
        lines.push(`<p>Se mueve ${b.moveRange} ${b.moveRange === 1 ? 'casilla' : 'casillas'} por noche · deja ${b.reward} materiales</p>`);
    }

    const day = this.game.state.phase === 'day' && !this.busy;
    if (day && sel && this.mode.kind === 'select') {
      if (unit?.team === 'night' && this.game.attackTargets(sel.id).some((e) => e.id === unit.id)) {
        const dmg = this.game.attackDamage(sel, unit);
        const counter = this.game.wouldCounter(sel, unit) && unit.hp - dmg > 0 ? unit.atk : 0;
        color = COLORS.attack;
        const after = counter
          ? ` · contraataque ${counter}`
          : unit.hp - dmg <= 0
            ? ' · <em>lo derribas</em>'
            : ' · <em>sin contraataque</em>';
        lines.push(
          `<p class="tip-action attack">Atacar (1 h): ${dmg} de daño${dmg > sel.atk ? ' <em>¡flanqueo!</em>' : ''}${after}</p>`,
        );
      } else if (!unit) {
        const reach = this.game.reachable(sel.id);
        const r = reach.get(key(hex));
        if (r) {
          color = COLORS.move;
          this.board.showPath([{ q: sel.q, r: sel.r }, ...this.game.pathFrom(reach, hex)]);
          lines.push(`<p class="tip-action move">Mover aquí: ${r.cost} ${r.cost === 1 ? 'hora' : 'horas'}</p>`);
        }
      }
    } else if (day && this.mode.kind === 'build') {
      if (this.game.buildSpots(this.mode.building).some((h) => equals(h, hex))) {
        color = COLORS.build;
        lines.push(`<p class="tip-action build">Construir ${BALANCE.buildings[this.mode.building].name.toLowerCase()} aquí</p>`);
      }
    }

    this.board.setHover(hex, color);
    this.hud.showTip({ clientX: this.pointer.x, clientY: this.pointer.y }, lines.join(''));
  }

  private syncUnitVisibility() {
    for (const u of this.game.state.units) {
      if (u.team === 'dawn') continue;
      this.units.setVisible(u.id, this.game.isUnitVisible(u));
    }
  }

  private dayClock() {
    const k = 1 - this.game.state.hours / BALANCE.hoursPerDay;
    return CLOCK.morning + (CLOCK.evening - CLOCK.morning) * k;
  }

  // ───────────────────────── reproducción de eventos ─────────────────────────

  private async run(res: Result, resetMode = false) {
    if (!res.ok) {
      this.fail(res.reason);
      return;
    }
    if (resetMode) this.mode = { kind: 'select' };
    this.busy = true;
    this.hud.setBusy(true);
    this.board.clearHighlights();
    this.board.showPath([]);
    this.hud.hideTip();
    try {
      await this.play(res.events);
    } finally {
      anim.speed = 1;
      this.busy = false;
      this.hud.setBusy(false);
      if (this.game.state.phase === 'day') {
        this.world.setClock(this.dayClock(), 900);
        if (this.mode.kind === 'build' && this.game.canBuild(this.mode.building)) this.mode = { kind: 'select' };
        if (this.selectedId === null || !this.game.unit(this.selectedId)) this.select(this.game.hero?.id ?? null);
        this.refresh();
        this.save();
      }
    }
  }

  private tileVec(h: Hex, lift = 0): THREE.Vector3 {
    const { x, z } = worldPos(h);
    return new THREE.Vector3(x, this.board.tileTop(h) + lift, z);
  }

  private isVisibleId(id: number) {
    const u = this.game.unit(id);
    return !u || this.game.isUnitVisible(u);
  }

  private async play(events: GameEvent[]) {
    let raining = false;
    // El estado ya es el final (amanecer incluido): la fase visual se lleva aquí.
    let inNight = false;
    for (const ev of events) {
      switch (ev.type) {
        case 'move': {
          const u = this.game.unit(ev.unitId);
          if (u?.team === 'night') {
            const from = this.game.tile(ev.path[0]);
            const to = this.game.tile(ev.path[ev.path.length - 1]);
            const vis = u.kind === 'king' ? !!(from?.explored || to?.explored) : !!(from?.visible || to?.visible);
            this.units.setVisible(u.id, vis);
            if (!vis) {
              await this.units.walk(ev.unitId, [ev.path[0], ev.path[ev.path.length - 1]]);
              break;
            }
          } else {
            audio.play('step');
          }
          await this.units.walk(ev.unitId, ev.path);
          break;
        }
        case 'attack': {
          const target = this.game.unit(ev.targetId);
          const attacker = this.game.unit(ev.attackerId);
          // De noche, la cámara acompaña los golpes contra tus unidades.
          if (inNight && this.settings.autoCamera && target?.team === 'dawn' && attacker && this.game.isUnitVisible(attacker)) {
            const p = this.units.positionOf(ev.targetId);
            if (p) await this.world.focus(p, 450);
          }
          if (ev.ranged) {
            audio.play('zap');
            await this.units.shoot(ev.attackerId, ev.targetId);
          } else {
            audio.play('swing');
            await this.units.lunge(ev.attackerId, ev.targetId);
          }
          break;
        }
        case 'siege': {
          const attacker = this.game.unit(ev.attackerId);
          const target = this.tileVec(ev.at, 0.3);
          const isCastle = equals(ev.at, this.game.state.castle);
          if (inNight && this.settings.autoCamera && isCastle && attacker && this.game.isUnitVisible(attacker))
            await this.world.focus(target, 450);
          audio.play('swing');
          await this.units.lungeAt(ev.attackerId, target);
          break;
        }
        case 'structureHit': {
          audio.play('hit');
          this.board.structureHit(ev.at, ev.hp, ev.maxHp);
          if (this.game.tile(ev.at)?.visible) this.units.floatText(this.tileVec(ev.at, 0.9), `-${ev.amount}`, 'dmg-dawn');
          if (equals(ev.at, this.game.state.castle)) this.world.shake(0.18);
          await anim.wait(220);
          break;
        }
        case 'repair':
          this.board.repaired(ev.at, ev.hp, ev.maxHp);
          break;
        case 'damage': {
          const u = this.game.unit(ev.unitId);
          const ours = !u || u.team === 'dawn';
          if (this.isVisibleId(ev.unitId)) audio.play(ev.source === 'hunger' ? 'bad' : ours && u ? 'hurt' : 'hit');
          this.units.hit(ev.unitId, ev.amount, ev.hp, ev.source);
          await anim.wait(ev.source === 'counter' ? 380 : 260);
          break;
        }
        case 'heal':
          audio.play('heal');
          this.units.heal(ev.unitId, ev.amount, ev.hp);
          break;
        case 'death':
          audio.play('death');
          await this.units.die(ev.unitId);
          break;
        case 'levelUp':
          audio.play('levelUp');
          this.units.levelUp(ev.unitId, ev.level, ev.hp, ev.maxHp);
          await anim.wait(500);
          break;
        case 'spawn': {
          const vis = ev.unit.team === 'dawn' || !!this.game.tile(ev.unit)?.visible;
          const p = this.units.add(ev.unit, true);
          this.units.setVisible(ev.unit.id, vis);
          if (vis) {
            audio.play(ev.unit.team === 'night' ? 'spawn' : 'good');
            await p;
          } else if (ev.unit.team === 'night') this.hud.log('Algo se agita en la oscuridad…', 'bad');
          break;
        }
        case 'build':
          audio.play('build');
          await this.board.addStructure(ev.at, ev.structure, { animate: true, work: ev.days, total: ev.days });
          break;
        case 'progress':
          await this.board.setProgress(ev.at, ev.left, ev.total);
          break;
        case 'built':
          audio.play('build');
          await this.board.completeStructure(ev.at);
          break;
        case 'castleWork': {
          const p = this.tileVec(this.game.state.castle, 0.6);
          this.particles.emit({ pos: p, count: 20, color: 0xd8c7a3, speed: 0.8, up: 1, life: 900, size: 0.1, gravity: 1, spread: 0.6 });
          audio.play('build');
          break;
        }
        case 'castleUpgraded': {
          const name = BALANCE.castle.levels[ev.level - 1].name;
          audio.play('levelUp');
          if (this.settings.autoCamera) await this.world.focus(this.tileVec(this.game.state.castle), 600);
          this.hud.banner(name, 'El castillo crece', 2200, 'dawn');
          await this.board.setCastleLevel(this.game.state.castle, ev.level);
          break;
        }
        case 'destroy':
          audio.play('collapse');
          await this.board.removeStructure(ev.at);
          break;
        case 'claim':
          this.board.rebuildTerritory(ev.tiles);
          break;
        case 'vision':
          this.board.syncVision();
          this.syncUnitVisibility();
          break;
        case 'towerShot': {
          const from = this.tileVec(ev.from, ev.castle ? 1.0 : 1.3);
          if (this.units.has(ev.targetId)) {
            audio.play('zap');
            await this.units.projectile(from, ev.targetId);
          }
          break;
        }
        case 'nightfall':
          inNight = true;
          anim.speed = this.spaceHeld ? 3 : this.settings.nightSpeed;
          audio.play('nightfall');
          this.hud.setNight(true);
          this.units.select(null);
          this.units.setDanger(new Set());
          this.hud.showNightfall();
          this.hud.banner('Cae la noche', 'Las sombras se mueven', 1900 / anim.speed, 'night');
          await this.world.setClock(CLOCK.midnight, 1900);
          break;
        case 'storm': {
          if (!raining) {
            raining = true;
            this.hud.banner('Tormenta', '', 1400 / anim.speed, 'night');
            await this.world.setRain(true);
          }
          const target = ev.at
            ? this.tileVec(ev.at, 0.3)
            : new THREE.Vector3((Math.random() - 0.5) * 12, 0.5, (Math.random() - 0.5) * 12);
          audio.play('thunder');
          await this.world.lightning(target);
          break;
        }
        case 'kingWakes': {
          const king = this.game.king;
          audio.play('roar');
          this.hud.banner('El Rey despierta', 'Ahora avanzará cada noche hacia ti', 2400 / anim.speed, 'epic');
          if (king) {
            this.units.setKingAwake(true);
            if (this.settings.autoCamera && this.game.isUnitVisible(king)) {
              const p = this.units.positionOf(king.id);
              if (p) await this.world.focus(p, 600);
            }
            await this.units.kingRoar(king.id);
          }
          break;
        }
        case 'dawn': {
          const r = ev.report;
          if (raining) {
            raining = false;
            this.world.setRain(false);
          }
          inNight = false;
          anim.speed = 1;
          const netFood = r.production.food - r.upkeep;
          const parts = [`Víveres ${netFood >= 0 ? '+' : ''}${netFood}`];
          if (r.production.materials) parts.push(`Materiales +${r.production.materials}`);
          if (r.production.stone) parts.push(`Piedra +${r.production.stone}`);
          if (r.production.gold) parts.push(`Oro +${r.production.gold}`);
          if (r.newSettlers) parts.push(`+${r.newSettlers} habitante`);
          audio.play('dawn');
          this.hud.banner(
            `Día ${r.day}`,
            r.starving ? '¡Hambruna! Tus gentes sufren' : parts.join(' · '),
            2000,
            r.starving ? 'bad' : 'dawn',
          );
          await this.world.setClock(CLOCK.morning, 2200);
          this.hud.setNight(false);
          this.hud.update(this.game, null, null);
          if (r.starving) this.hud.log('No hay víveres: tus unidades pasan hambre y se marcha un habitante.', 'bad');
          break;
        }
        case 'beacon':
          audio.play('levelUp');
          this.hud.banner('El Faro resiste', `Noche ${ev.nights} de ${ev.needed}`, 2200, 'dawn');
          await anim.wait(400);
          break;
        case 'discover': {
          audio.play(ev.poi === 'ruins' ? 'good' : 'levelUp');
          this.board.celebratePoi(ev.at, POI_COLORS[ev.poi]);
          this.hud.omen(ev.title, ev.text, 'good');
          this.hud.log(`${ev.title}: ${ev.text}`, 'good');
          await anim.wait(700);
          break;
        }
        case 'omen':
          audio.play(ev.tone === 'good' ? 'good' : 'bad');
          this.hud.omen(ev.title, ev.text, ev.tone);
          this.hud.log(`${ev.title}: ${ev.text}`, ev.tone);
          await anim.wait(600);
          break;
        case 'log':
          this.hud.log(ev.text, ev.tone);
          break;
        case 'gameOver':
          await this.gameOver(ev.victory);
          return;
      }
    }
  }

  private async gameOver(victory: boolean) {
    this.busy = true;
    anim.speed = 1;
    clearSave();
    const record = victory
      ? recordVictory(this.game.state.difficulty, this.game.state.day)
      : { best: null, isNew: false };
    if (victory) {
      audio.play('victory');
      this.hud.setNight(false);
      this.world.flash(0.8, 1400);
      await this.world.setClock(CLOCK.morning + 1.08, 3000);
    } else {
      audio.play('defeat');
      if (this.game.state.endReason === 'castle') await this.world.focus(this.tileVec(this.game.state.castle), 800);
      await this.world.setClock(CLOCK.midnight, 1800);
    }
    this.hud.show(false);
    this.hud.hideTip();
    this.hud.showEnd(victory, this.game, record, (same) => {
      const url = new URL(location.href);
      url.searchParams.set('seed', same ? String(this.game.state.seed) : String(Math.floor(Math.random() * 1e9)));
      url.searchParams.set('difficulty', this.game.state.difficulty);
      url.searchParams.set('play', '1');
      location.href = url.toString();
    });
  }
}

function toggleHelp() {
  document.getElementById('help')!.classList.toggle('on');
}
