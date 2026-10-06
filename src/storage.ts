import type { DifficultyId } from './game/config';
import type { SaveData } from './game/types';

const SAVE_KEY = 'dawnspath.save.v2';
const RECORDS_KEY = 'dawnspath.records.v1';

/** Toda lectura/escritura va en try/catch: el almacenamiento puede no existir. */
function read<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(k: string, value: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(value));
  } catch {
    /* sin almacenamiento disponible */
  }
}

export function loadSave(): SaveData | null {
  const s = read<SaveData>(SAVE_KEY);
  return s && s.version === 2 && s.state?.phase === 'day' ? s : null;
}

export function storeSave(save: SaveData) {
  write(SAVE_KEY, save);
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignorado */
  }
}

/** Récord de días para ganar en cada dificultad. */
export function recordVictory(difficulty: DifficultyId, days: number): { best: number; isNew: boolean } {
  const records = read<Partial<Record<DifficultyId, number>>>(RECORDS_KEY) ?? {};
  const prev = records[difficulty];
  const isNew = prev === undefined || days < prev;
  if (isNew) {
    records[difficulty] = days;
    write(RECORDS_KEY, records);
  }
  return { best: isNew ? days : prev!, isNew };
}

export function bestRecord(difficulty: DifficultyId): number | null {
  return read<Partial<Record<DifficultyId, number>>>(RECORDS_KEY)?.[difficulty] ?? null;
}
