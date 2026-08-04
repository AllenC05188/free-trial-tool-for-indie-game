/* Randomness behind one interface, so every module that needs luck takes it as
   an argument instead of reaching for Math.random. Tests pass a seeded rng and
   a whole battle replays identically; the game passes the default. */

export const systemRng = { next: () => Math.random() };

/* mulberry32 — small, fast, good enough for a card game, and deterministic. */
export function seededRng(seed){
  let a = seed >>> 0;
  return {
    next(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };
}

export function shuffle(arr, rng = systemRng){
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick(arr, rng = systemRng){
  return arr[Math.floor(rng.next() * arr.length)];
}

export function randInt(a, b, rng = systemRng){
  return Math.floor(a + rng.next() * (b - a + 1));
}
