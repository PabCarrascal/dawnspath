/**
 * Motor de animaciones mínimo basado en promesas, sincronizado con el bucle
 * de render. Permite escribir secuencias con async/await.
 */
export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t * t,
  backOut: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  elasticOut: (t: number) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

interface Job {
  elapsed: number;
  duration: number;
  step: (k: number) => void;
  ease: Ease;
  resolve: () => void;
}

class Animator {
  private jobs: Job[] = [];
  /** Multiplicador global de velocidad (p. ej. para acelerar la noche). */
  speed = 1;

  tween(duration: number, step: (k: number) => void, e: Ease = ease.inOut): Promise<void> {
    return new Promise((resolve) => {
      if (duration <= 0) {
        step(1);
        resolve();
        return;
      }
      this.jobs.push({ elapsed: 0, duration, step, ease: e, resolve });
    });
  }

  wait(duration: number): Promise<void> {
    return this.tween(duration, () => {}, ease.linear);
  }

  update(dt: number) {
    const done: Job[] = [];
    for (const j of this.jobs) {
      j.elapsed += dt * this.speed;
      const t = Math.min(1, j.elapsed / j.duration);
      j.step(j.ease(t));
      if (t >= 1) done.push(j);
    }
    if (done.length) {
      this.jobs = this.jobs.filter((j) => !done.includes(j));
      for (const j of done) j.resolve();
    }
  }
}

export const anim = new Animator();

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
