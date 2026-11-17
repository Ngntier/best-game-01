// The level-up choices: ten upgrades, each stackable to its own cap, each
// changing how the ship plays. The world keeps the levels taken; this file
// only defines what exists and what taking one does to the ship's stats.
export const UPGRADES = [
  {
    id: 'rapid', name: 'Rapid Cycler', glyph: '»', color: '#ffd166', max: 5,
    desc: 'Fire 18% faster.',
    apply(stats) { stats.fireRate *= 1.18; },
  },
  {
    id: 'heavy', name: 'Heavy Bolts', glyph: '▲', color: '#ff5d8f', max: 5,
    desc: '+8 damage per bolt.',
    apply(stats) { stats.damage += 8; },
  },
  {
    id: 'swift', name: 'Ion Thrusters', glyph: '➤', color: '#7de3ff', max: 4,
    desc: '+12% move speed.',
    apply(stats) { stats.speed *= 1.12; },
  },
  {
    id: 'hull', name: 'Bloom Plating', glyph: '♥', color: '#3ae0b0', max: 4,
    desc: '+25 max hull and repair 25.',
    apply(stats, player) {
      stats.maxHull += 25;
      player.hull = Math.min(stats.maxHull, player.hull + 25);
    },
  },
  {
    id: 'twin', name: 'Split Cannon', glyph: '✚', color: '#ffb03a', max: 3,
    desc: '+1 bolt per volley.',
    apply(stats) { stats.projectiles += 1; },
  },
  {
    id: 'magnet', name: 'Seed Magnet', glyph: '◉', color: '#d8ff3a', max: 3,
    desc: '+70% pickup radius.',
    apply(stats) { stats.magnet *= 1.7; },
  },
  {
    id: 'blade', name: 'Orbit Blade', glyph: '✦', color: '#b388ff', max: 3,
    desc: '+1 orbiting blade.',
    apply(stats) { stats.blades += 1; },
  },
  {
    id: 'regen', name: 'Living Hull', glyph: '●', color: '#3ae0b0', max: 3,
    desc: 'Regenerate 0.8 hull per second.',
    apply(stats) { stats.regen += 0.8; },
  },
  {
    id: 'pierce', name: 'Lance Rounds', glyph: '◆', color: '#ff8a5c', max: 3,
    desc: 'Bolts pierce +1 enemy.',
    apply(stats) { stats.pierce += 1; },
  },
  {
    id: 'nova', name: 'Nova Bloom', glyph: '★', color: '#ff5d8f', max: 3,
    desc: 'A shockwave bursts around you every 6s.',
    apply(stats) { stats.nova += 1; },
  },
];

const BY_ID = new Map(UPGRADES.map((def) => [def.id, def]));

export function upgradeById(id) {
  return BY_ID.get(id);
}

/**
 * Roll `count` distinct upgrades the player can still take (below their cap),
 * shuffled by the seeded random source. Returns fewer when few are left.
 */
export function rollUpgrades(rng, levels, count = 3) {
  const available = UPGRADES.filter((def) => (levels[def.id] ?? 0) < def.max);
  for (let i = available.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}

/** Apply one upgrade to the ship, recording the level taken. */
export function applyUpgrade(def, player) {
  player.upgradeLevels[def.id] = (player.upgradeLevels[def.id] ?? 0) + 1;
  def.apply(player.stats, player);
}
