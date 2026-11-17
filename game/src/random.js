// A small seeded random source (mulberry32), so a run with ?seed=N plays the
// same every time: the screenshot scenes and any replay depend on it.
export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** A float in [0, 1). */
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + (max - min) * next();
    },
    /** An integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with the given probability. */
    chance(p) {
      return next() < p;
    },
    /** One element of a non-empty array. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** One [value, weight] pair from a weighted table. */
    weighted(table) {
      let total = 0;
      for (const [, weight] of table) total += weight;
      let roll = next() * total;
      for (const [value, weight] of table) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return table[table.length - 1][0];
    },
  };
}
