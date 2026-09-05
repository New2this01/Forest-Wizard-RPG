import { useCallback, useEffect, useRef, useState } from 'react';
import { Backpack as BackpackIcon, ChevronUp, Gem, LockKeyhole, Map as MapIcon, Pause, Play, RotateCcw, Shield, Smartphone, Sparkles, WandSparkles, X } from 'lucide-react';

type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';
type EnemyKind = 'slime' | 'goblin' | 'boar' | 'wolf' | 'treant' | 'guardian';
type LootKind = 'wand' | 'robe' | 'ring';
type ChestTier = 'Wooden' | 'Silver' | 'Golden' | 'Mythic';
type Vec = { x: number; y: number };
type UiState = {
  hp: number; maxHp: number; mana: number; maxMana: number; xp: number; nextXp: number;
  level: number; gold: number; weapon: string; robe: string; ring: string; damage: number; weaponBonus: number; robeBonus: number; ringBonus: number;
  critChance: number; critDamage: number; goldBonus: number; xpBonus: number;
};
type Obstacle = { x: number; y: number; r: number; type: 'tree' | 'rock' | 'bush' };
type Enemy = {
  id: number; kind: EnemyKind; name: string; level: number; x: number; y: number; r: number; hp: number; maxHp: number;
  damage: number; coinReward: number; xpReward: number; lootChance: number; isBoss: boolean; deathLife: number;
  speed: number; aggro: number; hitCooldown: number; wander: number; angle: number; hurt: number;
};
type Projectile = { x: number; y: number; vx: number; vy: number; life: number; damage: number; crit: boolean; targetId: number | null };
type Gear = { id: number; kind: LootKind; name: string; rarity: Rarity; bonus: number; critChance: number; critDamage: number; goldBonus: number; xpBonus: number; equipped: boolean };
type Pickup = { id: number; x: number; y: number; kind: 'gold' | LootKind | 'chest'; amount: number; name?: string; rarity?: Rarity; bonus?: number; chestTier?: ChestTier; bob: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type FloatText = { x: number; y: number; value: string; color: string; life: number; maxLife: number; emphasis?: boolean };
type GameState = {
  player: UiState & { x: number; y: number; r: number; lastDx: number; lastDy: number; hurt: number };
  enemies: Enemy[]; projectiles: Projectile[]; pickups: Pickup[]; backpack: Gear[]; particles: Particle[]; texts: FloatText[];
  obstacles: Obstacle[]; elapsed: number; spawnId: number; zoneId: number; bounds: { width: number; height: number }; shake: number;
};

const WORLD = { width: 2600, height: 1700 };
const CAMERA_ZOOM = 0.56;
const ZONE_BOUNDS: Record<number, { width: number; height: number }> = {
  1: { width: 2000, height: 1600 },
  2: { width: 2200, height: 1600 },
  3: { width: 2400, height: 1650 },
  4: WORLD,
};
const ZONES = [
  { id: 1, name: 'Mosslight Grove', subtitle: 'The moonlit clearing', unlockCost: 0, recommendedLevel: 1, lootMultiplier: 1, enemyMultiplier: 1, ground: ['#1b4a3e', '#1d4d40'], path: '#8a805b', pond: '#285f68', treeDark: '#102f30', treeMid: '#1d5750', bush: '#2b6a4b' },
  { id: 2, name: 'Whispering Fen', subtitle: 'Where the reeds remember', unlockCost: 125, recommendedLevel: 3, lootMultiplier: 1.2, enemyMultiplier: 1.28, ground: ['#264c43', '#285247'], path: '#7e7960', pond: '#2f6570', treeDark: '#172f35', treeMid: '#28605b', bush: '#3d7655' },
  { id: 3, name: 'Emberroot Wilds', subtitle: 'A warm and restless wood', unlockCost: 300, recommendedLevel: 6, lootMultiplier: 1.5, enemyMultiplier: 1.62, ground: ['#4a3c35', '#514238'], path: '#9a7759', pond: '#315b61', treeDark: '#33252c', treeMid: '#654743', bush: '#6c583d' },
  { id: 4, name: 'Starfall Hollow', subtitle: 'Beneath the ancient sky', unlockCost: 650, recommendedLevel: 10, lootMultiplier: 2, enemyMultiplier: 2.05, ground: ['#303b50', '#35435a'], path: '#777a88', pond: '#3a5b78', treeDark: '#1d263d', treeMid: '#384968', bush: '#49645c' },
] as const;
const rarityColors: Record<Rarity, string> = {
  Common: '#b9c6b1', Uncommon: '#65d4a1', Rare: '#6db6ee', Epic: '#c99aec', Legendary: '#f0b85d', Mythic: '#f27b9c',
};
const rarityOrder: Record<Rarity, number> = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Mythic: 6 };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const seeded = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
};

const ENEMY_PROFILES: Record<EnemyKind, { name: string; hp: number; damage: number; speed: number; radius: number; coins: number; xp: number; loot: number }> = {
  slime: { name: 'Forest Slime', hp: 45, damage: 6, speed: 50, radius: 22, coins: 8, xp: 30, loot: .28 },
  goblin: { name: 'Moss Goblin', hp: 64, damage: 9, speed: 72, radius: 19, coins: 17, xp: 42, loot: .38 },
  boar: { name: 'Wild Boar', hp: 82, damage: 12, speed: 62, radius: 24, coins: 20, xp: 52, loot: .42 },
  wolf: { name: 'Dark Wolf', hp: 72, damage: 14, speed: 92, radius: 18, coins: 23, xp: 58, loot: .45 },
  treant: { name: 'Ancient Treant', hp: 170, damage: 18, speed: 34, radius: 31, coins: 55, xp: 120, loot: .7 },
  guardian: { name: 'Forest Guardian', hp: 240, damage: 23, speed: 45, radius: 36, coins: 90, xp: 190, loot: .86 },
};

function createEnemy(id: number, kind: EnemyKind, x: number, y: number, zoneId: number, random: () => number, isBoss = false): Enemy {
  const profile = ENEMY_PROFILES[kind];
  const zone = ZONES[zoneId - 1] ?? ZONES[0];
  const multiplier = zone.enemyMultiplier * (isBoss ? 2.5 : 1);
  const level = Math.max(1, zone.recommendedLevel + (isBoss ? 2 : Math.floor(random() * 2)));
  return {
    id, kind, name: isBoss ? profile.name : profile.name, level, x, y, r: profile.radius,
    hp: Math.round(profile.hp * multiplier), maxHp: Math.round(profile.hp * multiplier),
    damage: Math.round(profile.damage * multiplier), coinReward: Math.round(profile.coins * multiplier),
    xpReward: Math.round(profile.xp * multiplier), lootChance: Math.min(.98, profile.loot + (isBoss ? .18 : 0)),
    isBoss, deathLife: 0, speed: profile.speed * (1 + (zone.id - 1) * .04) * (isBoss ? .8 : 1),
    aggro: (kind === 'goblin' || kind === 'wolf' ? 380 : 330) + (zone.id - 1) * 18, hitCooldown: 0, wander: random() * 5, angle: random() * Math.PI * 2, hurt: 0,
  };
}

type SaveData = { player: Partial<GameState['player']>; backpack: Gear[]; unlockedZones: number[]; zoneId: number };
const SAVE_KEY = 'forest-wizard-rpg-save';
function loadSave(): SaveData | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) as SaveData : null;
  } catch {
    return null;
  }
}
function saveGame(game: GameState, unlockedZones: Set<number>) {
  try {
    const { x: _x, y: _y, lastDx: _lastDx, lastDy: _lastDy, hurt: _hurt, r: _r, ...player } = game.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ player, backpack: game.backpack, unlockedZones: Array.from(unlockedZones), zoneId: game.zoneId }));
  } catch {
    // Storage can be unavailable in private browsing; the run remains playable.
  }
}

function createObstacles(zoneId = 1): Obstacle[] {
  const random = seeded(44 + zoneId * 917);
  const bounds = ZONE_BOUNDS[zoneId] ?? WORLD;
  const scaleX = bounds.width / WORLD.width;
  const scaleY = bounds.height / WORLD.height;
  const scale = Math.min(scaleX, scaleY);
  const point = (x: number, y: number, r: number, type: Obstacle['type']): Obstacle => ({ x: x * scaleX, y: y * scaleY, r: r * scale, type });
  const obstacles: Obstacle[] = [
    point(420, 350, 50, 'tree'), point(610, 1240, 58, 'tree'),
    point(2120, 360, 62, 'tree'), point(2250, 1170, 52, 'tree'),
    point(1080, 280, 42, 'tree'), point(1460, 1420, 56, 'tree'),
    point(780, 700, 34, 'rock'), point(1860, 580, 43, 'rock'),
    point(390, 980, 32, 'rock'), point(2070, 920, 36, 'rock'),
  ];
  for (let i = 0; i < 28; i += 1) {
    const x = 90 + random() * Math.max(180, bounds.width - 180); const y = 80 + random() * Math.max(160, bounds.height - 160);
    if (distance({ x, y }, { x: bounds.width / 2, y: bounds.height / 2 }) > 230) obstacles.push({ x, y, r: 18 + random() * 14, type: 'bush' });
  }
  return obstacles;
}

function makeGame(zoneId = 1, playerOverrides: Partial<GameState['player']> = {}, backpack: Gear[] = []): GameState {
  const zone = ZONES[zoneId - 1] ?? ZONES[0];
  const bounds = ZONE_BOUNDS[zone.id] ?? WORLD;
  const random = seeded(912 + zoneId * 139);
  const obstacles = createObstacles(zone.id);
  const enemies: Enemy[] = [];
  const spots: Vec[] = [
    { x: 430, y: 560 }, { x: 720, y: 330 }, { x: 970, y: 1180 }, { x: 1320, y: 330 },
    { x: 1780, y: 380 }, { x: 2180, y: 650 }, { x: 2260, y: 1290 }, { x: 1740, y: 1240 },
    { x: 480, y: 1380 }, { x: 840, y: 1450 }, { x: 1960, y: 900 }, { x: 380, y: 840 },
  ];
  const kinds: EnemyKind[] = ['goblin', 'slime', 'boar', 'slime', 'wolf', 'goblin', 'treant', 'slime', 'boar', 'wolf', 'slime', 'goblin'];
  spots.map((spot) => ({ x: spot.x * bounds.width / WORLD.width, y: spot.y * bounds.height / WORLD.height })).forEach((spot, index) => {
    enemies.push(createEnemy(index + 1, kinds[index], spot.x, spot.y, zone.id, random));
  });
  const bossKind: EnemyKind = zone.id === 4 ? 'guardian' : 'treant';
  enemies.push(createEnemy(80 + zone.id, bossKind, bounds.width * .76, bounds.height * .18, zone.id, random, true));
  return {
    player: { r: 17, hp: 100, maxHp: 100, mana: 100, maxMana: 100, xp: 0, nextXp: 100, level: 1, gold: 42, weapon: 'Ashwood Wand', robe: 'Mossweave Robe', ring: 'Moonseed Band', damage: 22, weaponBonus: 0, robeBonus: 0, ringBonus: 0, critChance: .08, critDamage: 1.8, goldBonus: 0, xpBonus: 0, ...playerOverrides, x: bounds.width / 2, y: bounds.height / 2, lastDx: 1, lastDy: 0, hurt: 0 },
    enemies, projectiles: [], pickups: [], backpack, particles: [], texts: [], obstacles, elapsed: 0, spawnId: 100, zoneId: zone.id, bounds, shake: 0,
  };
}

function blocked(x: number, y: number, radius: number, obstacles: Obstacle[]) {
  return obstacles.some((obstacle) => Math.hypot(x - obstacle.x, y - obstacle.y) < radius + obstacle.r * (obstacle.type === 'tree' ? .65 : .78));
}

function moveWithCollision(point: { x: number; y: number }, dx: number, dy: number, radius: number, obstacles: Obstacle[], bounds: { width: number; height: number }) {
  const nx = clamp(point.x + dx, radius + 28, bounds.width - radius - 28);
  const ny = clamp(point.y + dy, radius + 28, bounds.height - radius - 28);
  if (!blocked(nx, point.y, radius, obstacles)) point.x = nx;
  if (!blocked(point.x, ny, radius, obstacles)) point.y = ny;
}

function chooseLoot(random: () => number, enemy: Enemy): { kind: LootKind; name: string; rarity: Rarity; bonus: number; critChance: number; critDamage: number; goldBonus: number; xpBonus: number } {
  const roll = random() + (enemy.isBoss ? .12 : 0);
  const rarity: Rarity = roll > .985 ? 'Mythic' : roll > .95 ? 'Legendary' : roll > .83 ? 'Epic' : roll > .62 ? 'Rare' : roll > .3 ? 'Uncommon' : 'Common';
  const kind: LootKind = random() > .62 ? 'ring' : random() > .48 ? 'wand' : 'robe';
  const names: Record<LootKind, string[]> = {
    wand: ['Wooden Wand', 'Apprentice Wand', 'Forest Staff', 'Arcane Staff', 'Dragon Staff', 'Starfire Staff'],
    robe: ['Fernstitch Robe', 'Nightbloom Mantle', 'Hearthmoss Cloak', 'Silverleaf Vestment', 'Dewfall Cowl'],
    ring: ['Mossgold Ring', 'Moonseed Band', 'Emberloop', 'Starlit Signet', 'Dragonroot Ring'],
  };
  const prefix = rarity === 'Mythic' ? 'Mythic' : rarity === 'Legendary' ? 'Legendary' : rarity === 'Epic' ? 'Runed' : '';
  const bonus = Math.round((4 + rarityOrder[rarity] * 5 + random() * 7) * (enemy.isBoss ? 1.35 : 1));
  const statBoost = rarityOrder[rarity] * .012;
  return {
    kind, name: `${prefix ? `${prefix} ` : ''}${names[kind][Math.floor(random() * names[kind].length)]}`, rarity, bonus,
    critChance: kind === 'ring' ? .03 + statBoost : kind === 'wand' ? .01 + statBoost / 2 : 0,
    critDamage: kind === 'ring' ? .05 + statBoost : kind === 'wand' ? .03 + statBoost / 2 : 0,
    goldBonus: kind === 'ring' ? .04 + statBoost : 0,
    xpBonus: kind === 'ring' ? .04 + statBoost : 0,
  };
}

export default function ForestWizardGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialSaveRef = useRef<SaveData | null | undefined>(undefined);
  if (initialSaveRef.current === undefined) initialSaveRef.current = loadSave();
  const saved = initialSaveRef.current;
  const gameRef = useRef<GameState>(makeGame(saved?.zoneId ?? 1, saved?.player ?? {}, saved?.backpack ?? []));
  const keysRef = useRef<Set<string>>(new Set());
  const inputRef = useRef({ x: 0, y: 0 });
  const pauseRef = useRef(false);
  const apiRef = useRef<{ cast: () => void; reset: () => void; changeZone: (zoneId: number) => void; equip: (gearId: number) => void } | null>(null);
  const [ui, setUi] = useState<UiState>(gameRef.current.player);
  const [paused, setPaused] = useState(false);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const [backpackOpen, setBackpackOpen] = useState(false);
  const [backpack, setBackpack] = useState<Gear[]>(gameRef.current.backpack);
  const [unlockedZones, setUnlockedZones] = useState<number[]>(saved?.unlockedZones?.length ? saved.unlockedZones : [1]);
  const [lootToasts, setLootToasts] = useState<Array<{ id: number; text: string; rarity?: Rarity; color?: string }>>([]);
  const [levelFlash, setLevelFlash] = useState<number | null>(null);
  const [bossUi, setBossUi] = useState<{ name: string; hp: number; maxHp: number } | null>(null);
  const [chestReveal, setChestReveal] = useState<{ tier: ChestTier; reward: string } | null>(null);
  const [joystick, setJoystick] = useState({ x: 0, y: 0 });
  const toastId = useRef(0);
  const unlockedZonesRef = useRef(new Set(saved?.unlockedZones?.length ? saved.unlockedZones : [1]));

  const addToast = useCallback((text: string, rarity?: Rarity, color?: string) => {
    const id = toastId.current++;
    setLootToasts((current) => [...current.slice(-2), { id, text, rarity, color }]);
    window.setTimeout(() => setLootToasts((current) => current.filter((toast) => toast.id !== id)), 3600);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const game = gameRef.current;
    let frame = 0;
    let previous = performance.now();
    let lastUi = 0;
    let viewW = 0; let viewH = 0; let dpr = 1;
    const random = seeded(773);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewW = rect.width; viewH = rect.height;
      canvas.width = Math.floor(viewW * dpr); canvas.height = Math.floor(viewH * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const burst = (x: number, y: number, color: string, count = 8) => {
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2; const speed = 25 + random() * 90;
        game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .45 + random() * .45, maxLife: 1, color, size: 2 + random() * 4 });
      }
    };
    const text = (x: number, y: number, value: string, color: string) => game.texts.push({ x, y, value, color, life: 1, maxLife: 1 });
    const nearestEnemy = () => game.enemies.filter((enemy) => enemy.hp > 0).sort((a, b) => distance(a, game.player) - distance(b, game.player))[0];

    const cast = () => {
      if (pauseRef.current || game.player.mana < 12) return;
      const target = nearestEnemy();
      let dx = game.player.lastDx; let dy = game.player.lastDy;
      if (target && distance(target, game.player) < 740) {
        const length = distance(target, game.player) || 1; dx = (target.x - game.player.x) / length; dy = (target.y - game.player.y) / length;
      }
      game.player.mana -= 12;
      game.projectiles.push({ x: game.player.x + dx * 22, y: game.player.y + dy * 22, vx: dx * 520, vy: dy * 520, life: 1.7, damage: game.player.damage, targetId: target?.id ?? null });
      burst(game.player.x + dx * 20, game.player.y + dy * 20, '#f7d881', 5);
    };
    const reset = () => {
      gameRef.current = makeGame(1);
      Object.assign(game, gameRef.current);
      setUi(game.player);
      setBackpack([]);
      unlockedZonesRef.current = new Set([1]);
      setUnlockedZones([1]);
      setLootToasts([]);
      setLevelFlash(null);
      setBossUi(null);
      setChestReveal(null);
      window.localStorage.removeItem(SAVE_KEY);
      pauseRef.current = false;
      setPaused(false);
    };
    const changeZone = (zoneId: number) => {
      if (!unlockedZonesRef.current.has(zoneId) || zoneId === game.zoneId) return;
      const previousPlayer = game.player;
      const next = makeGame(zoneId, {
        hp: previousPlayer.maxHp,
        maxHp: previousPlayer.maxHp,
        mana: previousPlayer.maxMana,
        maxMana: previousPlayer.maxMana,
        xp: previousPlayer.xp,
        nextXp: previousPlayer.nextXp,
        level: previousPlayer.level,
        gold: previousPlayer.gold,
        weapon: previousPlayer.weapon,
        robe: previousPlayer.robe,
        ring: previousPlayer.ring,
        damage: previousPlayer.damage,
        weaponBonus: previousPlayer.weaponBonus,
        robeBonus: previousPlayer.robeBonus,
        ringBonus: previousPlayer.ringBonus,
        critChance: previousPlayer.critChance,
        critDamage: previousPlayer.critDamage,
        goldBonus: previousPlayer.goldBonus,
        xpBonus: previousPlayer.xpBonus,
      }, game.backpack);
      gameRef.current = next;
      Object.assign(game, next);
      setUi(game.player);
      setBackpack([...game.backpack]);
      setLevelFlash(null);
      setZonePickerOpen(false);
      pauseRef.current = false;
      setPaused(false);
      saveGame(game, unlockedZonesRef.current);
      addToast(`Entered ${ZONES[zoneId - 1].name}`, undefined, '#b9d79d');
    };
    const equip = (gearId: number) => {
      const item = game.backpack.find((gear) => gear.id === gearId);
      if (!item) return;
      const currentBonus = item.kind === 'wand' ? game.player.weaponBonus : item.kind === 'robe' ? game.player.robeBonus : game.player.ringBonus;
      if (item.equipped) return;
      if (item.bonus <= currentBonus) {
        addToast(`${item.name} is weaker than your current ${item.kind}`, item.rarity, '#d89481');
        return;
      }
      const previousGear = game.backpack.find((gear) => gear.kind === item.kind && gear.equipped && gear.id !== item.id);
      game.backpack.forEach((gear) => { if (gear.kind === item.kind) gear.equipped = false; });
      item.equipped = true;
      game.player.critChance += item.critChance - (previousGear?.critChance ?? 0);
      game.player.critDamage += item.critDamage - (previousGear?.critDamage ?? 0);
      game.player.goldBonus += item.goldBonus - (previousGear?.goldBonus ?? 0);
      game.player.xpBonus += item.xpBonus - (previousGear?.xpBonus ?? 0);
      if (item.kind === 'wand') {
        game.player.damage += item.bonus - game.player.weaponBonus;
        game.player.weaponBonus = item.bonus;
        game.player.weapon = item.name;
      } else if (item.kind === 'robe') {
        const healthGain = item.bonus - game.player.robeBonus;
        game.player.robeBonus = item.bonus;
        game.player.maxHp += healthGain;
        game.player.hp = Math.min(game.player.maxHp, game.player.hp + healthGain);
        game.player.robe = item.name;
      } else {
        game.player.ringBonus = item.bonus;
        game.player.ring = item.name;
      }
      setUi({ ...game.player });
      setBackpack([...game.backpack]);
      saveGame(game, unlockedZonesRef.current);
      addToast(`${item.name} equipped`, item.rarity, rarityColors[item.rarity]);
    };
    apiRef.current = { cast, reset, changeZone, equip };

    const update = (dt: number) => {
      if (pauseRef.current) return;
      game.elapsed += dt;
      const player = game.player;
      const keyboardX = (keysRef.current.has('d') || keysRef.current.has('arrowright') ? 1 : 0) - (keysRef.current.has('a') || keysRef.current.has('arrowleft') ? 1 : 0);
      const keyboardY = (keysRef.current.has('s') || keysRef.current.has('arrowdown') ? 1 : 0) - (keysRef.current.has('w') || keysRef.current.has('arrowup') ? 1 : 0);
      let mx = inputRef.current.x || keyboardX; let my = inputRef.current.y || keyboardY;
      const length = Math.hypot(mx, my);
      if (length > 1) { mx /= length; my /= length; }
      if (Math.hypot(mx, my) > .08) { player.lastDx = mx; player.lastDy = my; moveWithCollision(player, mx * 185 * dt, my * 185 * dt, player.r, game.obstacles, game.bounds); }
      player.hurt = Math.max(0, player.hurt - dt);
      player.mana = Math.min(player.maxMana, player.mana + dt * 8);

      game.enemies.forEach((enemy) => {
        if (enemy.hp <= 0) return;
        enemy.hurt = Math.max(0, enemy.hurt - dt); enemy.hitCooldown -= dt; enemy.wander -= dt;
        const range = distance(enemy, player);
        let ex = 0; let ey = 0;
        if (range < enemy.aggro) { ex = (player.x - enemy.x) / (range || 1); ey = (player.y - enemy.y) / (range || 1); }
        else {
          if (enemy.wander <= 0) { enemy.angle += (random() - .5) * 2.7; enemy.wander = 1.5 + random() * 3; }
          ex = Math.cos(enemy.angle) * .38; ey = Math.sin(enemy.angle) * .38;
        }
        moveWithCollision(enemy, ex * enemy.speed * dt, ey * enemy.speed * dt, enemy.r, game.obstacles, game.bounds);
        if (range < enemy.r + player.r + 4 && enemy.hitCooldown <= 0) {
          enemy.hitCooldown = 1.05; player.hp = Math.max(0, player.hp - (enemy.kind === 'goblin' ? 9 : 6)); player.hurt = .3;
          text(player.x, player.y - 30, `-${enemy.kind === 'goblin' ? 9 : 6}`, '#f18b78'); burst(player.x, player.y, '#f18b78', 5);
          if (player.hp <= 0) { player.hp = player.maxHp; player.mana = player.maxMana; player.x = game.bounds.width / 2; player.y = game.bounds.height / 2; text(player.x, player.y - 45, 'The grove restores you', '#f7d881'); }
        }
      });

      game.projectiles.forEach((projectile) => {
        projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt; projectile.life -= dt;
        const enemy = projectile.targetId ? game.enemies.find((item) => item.id === projectile.targetId && item.hp > 0) : undefined;
        if (enemy) {
          const length = distance(projectile, enemy) || 1;
          projectile.vx += ((enemy.x - projectile.x) / length * 650 - projectile.vx) * dt * 1.5;
          projectile.vy += ((enemy.y - projectile.y) / length * 650 - projectile.vy) * dt * 1.5;
        }
        const hit = game.enemies.find((item) => item.hp > 0 && distance(projectile, item) < item.r + 9);
        if (hit) {
          hit.hp -= projectile.damage; hit.hurt = .15; projectile.life = 0; burst(projectile.x, projectile.y, '#f4d77c', 12);
          text(hit.x, hit.y - hit.r - 7, `${projectile.damage}`, '#f8dfa2');
          if (hit.hp <= 0) {
            const xpGain = hit.kind === 'goblin' ? 42 : 30;
            player.xp += xpGain; player.gold += hit.kind === 'goblin' ? 5 : 3;
            text(hit.x, hit.y - 36, `+${xpGain} XP`, '#99e2b1'); burst(hit.x, hit.y, hit.kind === 'goblin' ? '#d87975' : '#6bd5a4', 18);
            game.pickups.push({ id: game.spawnId++, x: hit.x + 12, y: hit.y + 8, kind: 'gold', amount: hit.kind === 'goblin' ? 9 + Math.floor(random() * 14) : 4 + Math.floor(random() * 9), bob: random() * 4 });
            if (random() > .28) {
              const loot = chooseLoot(random, hit);
              game.pickups.push({ id: game.spawnId++, x: hit.x - 12, y: hit.y - 8, kind: loot.kind, amount: loot.bonus, name: loot.name, rarity: loot.rarity, bonus: loot.bonus, bob: random() * 4 });
            }
          }
        }
      });
      game.projectiles = game.projectiles.filter((projectile) => projectile.life > 0);

      if (player.xp >= player.nextXp) {
        player.xp -= player.nextXp; player.level += 1; player.nextXp = Math.floor(player.nextXp * 1.34);
        player.maxHp += 13; player.hp = player.maxHp; player.maxMana += 9; player.mana = player.maxMana; player.damage += 6;
        setLevelFlash(player.level); window.setTimeout(() => setLevelFlash(null), 1000);
        text(player.x, player.y - 55, `LEVEL ${player.level}`, '#ffe49b'); burst(player.x, player.y, '#f4d77c', 26);
      }
      game.pickups.forEach((pickup) => {
        pickup.bob += dt * 2.2;
        if (distance(pickup, player) < 38) {
          pickup.x = player.x; pickup.y = player.y; pickup.bob = 0;
          if (pickup.kind === 'gold') { player.gold += pickup.amount; addToast(`Picked up ${pickup.amount} gold`, undefined, '#f1c861'); }
          else {
            const gear: Gear = { id: pickup.id, kind: pickup.kind, name: pickup.name ?? 'Mysterious Gear', rarity: pickup.rarity ?? 'Common', bonus: pickup.bonus ?? 0, equipped: false };
            game.backpack.push(gear);
            const currentBonus = gear.kind === 'wand' ? player.weaponBonus : player.robeBonus;
            addToast(`${gear.name} added to backpack${gear.bonus > currentBonus ? ' · better gear' : ''}`, gear.rarity, rarityColors[gear.rarity]);
            setBackpack([...game.backpack]);
          }
          burst(player.x, player.y, pickup.kind === 'gold' ? '#f1c861' : rarityColors[pickup.rarity ?? 'Common'], 10);
          pickup.amount = 0;
        }
      });
      game.pickups = game.pickups.filter((pickup) => pickup.amount > 0);
      game.particles.forEach((particle) => { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= .96; particle.vy *= .96; particle.life -= dt; });
      game.particles = game.particles.filter((particle) => particle.life > 0);
      game.texts.forEach((item) => { item.y -= 22 * dt; item.life -= dt; });
      game.texts = game.texts.filter((item) => item.life > 0);
      if (game.enemies.filter((enemy) => enemy.hp > 0).length < 9 && game.elapsed > 8) {
        const edge = random() > .5;
        const kind: EnemyKind = random() > .65 ? 'goblin' : 'slime';
        const enemyScale = (ZONES[game.zoneId - 1] ?? ZONES[0]).enemyMultiplier;
        const baseHp = kind === 'goblin' ? 64 : 45;
        game.enemies.push({ id: game.spawnId++, kind, x: edge ? (random() > .5 ? 130 : 2470) : 150 + random() * 2300, y: edge ? 150 + random() * 1400 : (random() > .5 ? 120 : 1580), r: kind === 'goblin' ? 19 : 22, hp: Math.round(baseHp * enemyScale), maxHp: Math.round(baseHp * enemyScale), speed: (kind === 'goblin' ? 72 : 50) * (1 + (game.zoneId - 1) * .04), aggro: 360 + (game.zoneId - 1) * 18, hitCooldown: 0, wander: 2, angle: random() * 6, hurt: 0 });
      }
    };

    const draw = () => {
      context.clearRect(0, 0, viewW, viewH);
      const player = game.player;
      const zone = ZONES[game.zoneId - 1] ?? ZONES[0];
      const worldViewW = viewW / CAMERA_ZOOM;
      const worldViewH = viewH / CAMERA_ZOOM;
      const camX = clamp(game.player.x - worldViewW / 2, 0, game.bounds.width - worldViewW);
      const camY = clamp(game.player.y - worldViewH / 2, 0, game.bounds.height - worldViewH);
      const centerX = game.bounds.width / 2;
      const centerY = game.bounds.height / 2;
      context.save(); context.scale(CAMERA_ZOOM, CAMERA_ZOOM); context.translate(-camX, -camY);
      context.fillStyle = zone.ground[0]; context.fillRect(camX, camY, worldViewW, worldViewH);
      const tile = 64; const startX = Math.floor(camX / tile) * tile; const startY = Math.floor(camY / tile) * tile;
      for (let x = startX; x < camX + worldViewW + tile; x += tile) for (let y = startY; y < camY + worldViewH + tile; y += tile) {
        context.fillStyle = ((x / tile + y / tile) % 2 === 0) ? zone.ground[0] : zone.ground[1]; context.fillRect(x, y, tile + 1, tile + 1);
        context.fillStyle = 'rgba(143, 184, 111, .09)'; context.beginPath(); context.arc(x + 15 + ((y / 7) % 19), y + 24, 1.4, 0, Math.PI * 2); context.fill();
      }
      // Moonlit paths and pond.
      context.fillStyle = zone.path; context.globalAlpha = .18; context.beginPath(); context.moveTo(centerX - 40, game.bounds.height); context.bezierCurveTo(centerX - 140, game.bounds.height * .76, centerX + 80, centerY + 200, centerX, centerY); context.bezierCurveTo(centerX - 20, centerY - 260, centerX + 100, game.bounds.height * .2, centerX + 260, 0); context.lineTo(centerX + 380, 0); context.bezierCurveTo(centerX + 190, game.bounds.height * .2, centerX + 130, centerY - 260, centerX + 150, centerY); context.bezierCurveTo(centerX + 200, centerY + 300, centerX + 40, game.bounds.height * .78, centerX + 140, game.bounds.height); context.closePath(); context.fill();
      context.fillStyle = zone.pond; context.beginPath(); context.ellipse(game.bounds.width * .16, game.bounds.height * .19, 190, 90, -.2, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1;
      context.strokeStyle = 'rgba(151, 220, 209, .25)'; context.lineWidth = 3; context.stroke();
      game.obstacles.forEach((obstacle) => {
        if (obstacle.type === 'tree') {
          context.fillStyle = 'rgba(3, 24, 24, .3)'; context.beginPath(); context.ellipse(obstacle.x, obstacle.y + 32, obstacle.r * .95, obstacle.r * .33, 0, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#4e3329'; context.beginPath(); context.roundRect(obstacle.x - 12, obstacle.y - 4, 24, obstacle.r + 39, 8); context.fill();
          context.fillStyle = zone.treeDark; context.beginPath(); context.arc(obstacle.x - 21, obstacle.y - 25, obstacle.r * .7, 0, Math.PI * 2); context.arc(obstacle.x + 25, obstacle.y - 31, obstacle.r * .72, 0, Math.PI * 2); context.arc(obstacle.x, obstacle.y - 55, obstacle.r * .68, 0, Math.PI * 2); context.fill();
          context.fillStyle = zone.treeMid; context.beginPath(); context.arc(obstacle.x - 17, obstacle.y - 29, obstacle.r * .56, 0, Math.PI * 2); context.arc(obstacle.x + 22, obstacle.y - 33, obstacle.r * .56, 0, Math.PI * 2); context.arc(obstacle.x, obstacle.y - 58, obstacle.r * .5, 0, Math.PI * 2); context.fill();
        } else if (obstacle.type === 'rock') {
          context.fillStyle = 'rgba(3,24,24,.25)'; context.beginPath(); context.ellipse(obstacle.x, obstacle.y + 15, obstacle.r * 1.1, 10, 0, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#647671'; context.beginPath(); context.ellipse(obstacle.x, obstacle.y, obstacle.r, obstacle.r * .72, -.2, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#8ea298'; context.beginPath(); context.ellipse(obstacle.x - 8, obstacle.y - 6, obstacle.r * .45, obstacle.r * .22, -.3, 0, Math.PI * 2); context.fill();
        } else {
          context.fillStyle = zone.bush; context.beginPath(); context.arc(obstacle.x - 9, obstacle.y + 4, obstacle.r * .7, 0, Math.PI * 2); context.arc(obstacle.x + 9, obstacle.y + 1, obstacle.r * .67, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#d7c874'; context.beginPath(); context.arc(obstacle.x + 2, obstacle.y - 9, 3, 0, Math.PI * 2); context.fill();
        }
      });
      game.pickups.forEach((pickup) => {
        const color = pickup.kind === 'gold' ? '#f1c861' : rarityColors[pickup.rarity ?? 'Common'];
        context.save(); context.translate(pickup.x, pickup.y + Math.sin(pickup.bob) * 4);
        context.fillStyle = 'rgba(245,219,132,.13)'; context.beginPath(); context.arc(0, 0, 15, 0, Math.PI * 2); context.fill();
        context.fillStyle = color; context.strokeStyle = '#fff1bd'; context.lineWidth = 1.5;
        if (pickup.kind === 'gold') { context.beginPath(); context.arc(0, 0, 7, 0, Math.PI * 2); context.fill(); context.stroke(); }
        else { context.rotate(.7); context.beginPath(); context.roundRect(-5, -10, 10, 20, 3); context.fill(); context.stroke(); }
        context.restore();
      });
      game.enemies.forEach((enemy) => {
        if (enemy.hp <= 0) return;
        context.save(); context.translate(enemy.x, enemy.y);
        context.fillStyle = 'rgba(3,24,24,.28)'; context.beginPath(); context.ellipse(0, enemy.r + 8, enemy.r * .9, 6, 0, 0, Math.PI * 2); context.fill();
        if (enemy.kind === 'slime') {
          context.fillStyle = enemy.hurt > 0 ? '#d9f2bf' : '#60bf8f'; context.beginPath(); context.arc(0, 2, enemy.r, Math.PI, 0); context.quadraticCurveTo(enemy.r - 3, enemy.r + 8, 0, enemy.r + 7); context.quadraticCurveTo(-enemy.r + 3, enemy.r + 8, -enemy.r, 0); context.fill();
          context.fillStyle = '#183e39'; context.beginPath(); context.arc(-7, 0, 2.5, 0, Math.PI * 2); context.arc(7, 0, 2.5, 0, Math.PI * 2); context.fill();
        } else {
          context.fillStyle = enemy.hurt > 0 ? '#f5b09a' : '#a65d61'; context.beginPath(); context.arc(0, 0, enemy.r, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#e7d1a1'; context.beginPath(); context.moveTo(-12, -10); context.lineTo(-19, -23); context.lineTo(-4, -15); context.moveTo(12, -10); context.lineTo(19, -23); context.lineTo(4, -15); context.fill();
          context.fillStyle = '#1b3030'; context.beginPath(); context.arc(-6, -1, 2.5, 0, Math.PI * 2); context.arc(6, -1, 2.5, 0, Math.PI * 2); context.fill();
        }
        context.fillStyle = 'rgba(15,25,25,.8)'; context.fillRect(-24, -enemy.r - 16, 48, 5);
        context.fillStyle = enemy.kind === 'goblin' ? '#da796d' : '#69d39c'; context.fillRect(-24, -enemy.r - 16, 48 * clamp(enemy.hp / enemy.maxHp, 0, 1), 5);
        context.restore();
      });
      game.projectiles.forEach((projectile) => {
        context.save(); context.translate(projectile.x, projectile.y); context.rotate(Math.atan2(projectile.vy, projectile.vx));
        context.fillStyle = 'rgba(248,211,108,.18)'; context.beginPath(); context.ellipse(-8, 0, 17, 7, 0, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#f8da79'; context.beginPath(); context.moveTo(11, 0); context.lineTo(-7, -6); context.lineTo(-4, 0); context.lineTo(-7, 6); context.closePath(); context.fill(); context.restore();
      });
      game.particles.forEach((particle) => { context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); context.fillStyle = particle.color; context.beginPath(); context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); context.fill(); }); context.globalAlpha = 1;
      // Wizard last, so the hero reads clearly over the ground.
      context.save(); context.translate(player.x, player.y); context.globalAlpha = player.hurt > 0 && Math.floor(game.elapsed * 16) % 2 === 0 ? .4 : 1;
      context.fillStyle = 'rgba(3,24,24,.36)'; context.beginPath(); context.ellipse(0, 20, 23, 8, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#b9c4e5'; context.beginPath(); context.moveTo(-17, 18); context.quadraticCurveTo(0, 3, 17, 18); context.lineTo(11, 24); context.lineTo(-11, 24); context.closePath(); context.fill();
      context.fillStyle = '#d6a55d'; context.fillRect(-7, 1, 14, 16); context.fillStyle = '#e9bc7a'; context.beginPath(); context.arc(0, -7, 10, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#342848'; context.beginPath(); context.moveTo(-13, -10); context.lineTo(0, -34); context.lineTo(15, -10); context.lineTo(8, -13); context.lineTo(0, -22); context.lineTo(-8, -13); context.closePath(); context.fill();
      context.strokeStyle = '#e8c66d'; context.lineWidth = 3; context.beginPath(); context.moveTo(13, 5); context.lineTo(25, -13); context.stroke(); context.fillStyle = '#f5d77a'; context.beginPath(); context.arc(26, -15, 4, 0, Math.PI * 2); context.fill();
      context.restore();
      game.texts.forEach((item) => { context.globalAlpha = clamp(item.life / item.maxLife, 0, 1); context.font = '600 14px Outfit'; context.textAlign = 'center'; context.fillStyle = item.color; context.fillText(item.value, item.x, item.y); }); context.globalAlpha = 1;
      context.restore();
      // Subtle vignette anchors the playfield without reducing readability.
      const vignette = context.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * .22, viewW / 2, viewH / 2, Math.max(viewW, viewH) * .76);
      vignette.addColorStop(0, 'rgba(4,22,24,0)'); vignette.addColorStop(1, 'rgba(3,18,20,.42)'); context.fillStyle = vignette; context.fillRect(0, 0, viewW, viewH);
    };

    const loop = (now: number) => {
      const dt = Math.min((now - previous) / 1000, .05); previous = now;
      update(dt); draw();
      if (now - lastUi > 100) { setUi({ ...game.player }); setBackpack([...game.backpack]); lastUi = now; }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [addToast]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { event.preventDefault(); keysRef.current.add(key); }
      if (key === ' ' || key === 'j') { event.preventDefault(); apiRef.current?.cast(); }
      if (key === 'escape') { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }
    };
    const up = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    const visibility = () => { if (document.hidden) { pauseRef.current = true; setPaused(true); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  const updateJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); const dx = event.clientX - (rect.left + rect.width / 2); const dy = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width * .33; const length = Math.hypot(dx, dy) || 1; const scale = Math.min(1, max / length); const x = dx * scale / max; const y = dy * scale / max;
    inputRef.current = { x, y }; setJoystick({ x: x * 36, y: y * 36 }); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resetJoystick = () => { inputRef.current = { x: 0, y: 0 }; setJoystick({ x: 0, y: 0 }); };
  const togglePause = () => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); };
  const currentZone = ZONES[gameRef.current.zoneId - 1] ?? ZONES[0];
  const openZonePicker = () => { pauseRef.current = true; setPaused(true); setZonePickerOpen(true); };
  const closeZonePicker = () => { setZonePickerOpen(false); pauseRef.current = false; setPaused(false); };
  const openBackpack = () => { pauseRef.current = true; setPaused(true); setBackpackOpen(true); };
  const closeBackpack = () => { setBackpackOpen(false); pauseRef.current = false; setPaused(false); };
  const currentGearBonus = (item: Gear) => item.kind === 'wand' ? ui.weaponBonus : ui.robeBonus;
  const selectZone = (zoneId: number) => {
    const target = ZONES[zoneId - 1];
    if (!target) return;
    if (!unlockedZonesRef.current.has(zoneId)) {
      if (zoneId > 1 && !unlockedZonesRef.current.has(zoneId - 1)) {
        addToast(`Unlock Zone ${zoneId - 1} first`, undefined, '#d89481');
        return;
      }
      if (ui.gold < target.unlockCost) {
        addToast(`Need ${target.unlockCost - ui.gold} more gold`, undefined, '#e9a29a');
        return;
      }
      gameRef.current.player.gold -= target.unlockCost;
      unlockedZonesRef.current.add(zoneId);
      setUnlockedZones(Array.from(unlockedZonesRef.current));
      addToast(`${target.name} unlocked`, undefined, '#f1c861');
    }
    apiRef.current?.changeZone(zoneId);
  };

  return (
    <main className="game-shell" data-testid="game-shell">
      <canvas ref={canvasRef} className="game-canvas" data-testid="game-canvas" aria-label="Forest Wizard playable world" />
      <div className="portrait-only-overlay" data-testid="portrait-only-overlay">
        <div className="portrait-only-card glass-panel">
          <Smartphone size={30} />
          <h2>Turn your device upright</h2>
          <p>Forest Wizard is built for portrait play so the full grove and touch controls stay visible.</p>
        </div>
      </div>
      <div className="hud-layer">
        <section className="hud-top" style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
          <div className="game-brand" style={{ color: '#f6d779', fontFamily: 'var(--app-font-serif)', fontSize: 23, lineHeight: 1 }}>
            Forest Wizard <span style={{ color: '#a9c79c', fontFamily: 'var(--app-font-sans)', fontSize: 12, letterSpacing: '.13em', textTransform: 'uppercase' }}>RPG</span>
            <div className="brand-subtitle" style={{ color: 'rgba(215,230,193,.65)', fontFamily: 'var(--app-font-mono)', fontSize: 10, marginTop: 8, letterSpacing: '.06em' }}>THE MOONLIT CLEARING</div>
            <button className="zone-chip" data-testid="button-zone-picker" onClick={openZonePicker} aria-label={`Open zones. Current zone ${currentZone.id}`}>
              <MapIcon size={15} />
              <span><b>ZONE {currentZone.id}</b><strong>{currentZone.name}</strong></span>
              <span className="zone-chip-arrow">VIEW</span>
            </button>
          </div>
          <div className="status-grid" style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
            <div className="glass-panel status-card" style={{ width: 196, padding: '10px 12px', borderRadius: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span className="stat-label" style={{ color: '#e9a29a', fontFamily: 'var(--app-font-mono)', fontSize: 10, letterSpacing: '.08em' }}>VITALITY</span><span className="stat-value" data-testid="text-health" style={{ fontFamily: 'var(--app-font-mono)', fontSize: 11, color: '#f6dbc0' }}>{Math.ceil(ui.hp)} / {ui.maxHp}</span></div>
              <div className="hud-bar"><div className="hud-fill" style={{ width: `${ui.hp / ui.maxHp * 100}%`, background: '#d4746f' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '9px 0 6px' }}><span className="stat-label" style={{ color: '#8ad7d3', fontFamily: 'var(--app-font-mono)', fontSize: 10, letterSpacing: '.08em' }}>MANA</span><span className="stat-value" data-testid="text-mana" style={{ fontFamily: 'var(--app-font-mono)', fontSize: 11, color: '#c6e4df' }}>{Math.ceil(ui.mana)} / {ui.maxMana}</span></div>
              <div className="hud-bar"><div className="hud-fill" style={{ width: `${ui.mana / ui.maxMana * 100}%`, background: '#66b9b7' }} /></div>
            </div>
            <div className="glass-panel status-card" style={{ padding: '10px 13px', minWidth: 116, borderRadius: 13, textAlign: 'center' }}>
              <div style={{ color: '#d6bf79', fontFamily: 'var(--app-font-mono)', fontSize: 10, letterSpacing: '.1em' }}>LEVEL</div>
              <div data-testid="text-level" style={{ color: '#fae6a1', fontFamily: 'var(--app-font-serif)', fontSize: 28, lineHeight: 1.08 }}>{ui.level}</div>
              <div className="hud-bar" style={{ marginTop: 7 }}><div className="hud-fill" style={{ width: `${ui.xp / ui.nextXp * 100}%`, background: '#d7bc64' }} /></div>
              <div style={{ color: 'rgba(223,234,195,.63)', fontFamily: 'var(--app-font-mono)', fontSize: 9, marginTop: 4 }}>{ui.xp} / {ui.nextXp} XP</div>
            </div>
            <button className="hud-button" data-testid="button-pause" aria-label={paused ? 'Resume game' : 'Pause game'} onClick={togglePause}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
          </div>
        </section>
        <section className="equipment-panel glass-panel" style={{ position: 'absolute', bottom: 20, left: 22, padding: '12px 14px', borderRadius: 14, minWidth: 190 }}>
          <div style={{ color: '#9bb79b', fontFamily: 'var(--app-font-mono)', fontSize: 9, letterSpacing: '.14em', marginBottom: 9 }}>YOUR SATCHEL</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}><span style={{ width: 27, height: 27, display: 'grid', placeItems: 'center', borderRadius: 8, color: '#f0ca6c', background: 'rgba(217,177,86,.14)' }}><WandSparkles size={15} /></span><div><div style={{ color: '#f2dfa0', fontSize: 12 }}>{ui.weapon}</div><div style={{ color: '#9bb79b', fontFamily: 'var(--app-font-mono)', fontSize: 9 }}>POWER {ui.damage}</div></div></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ width: 27, height: 27, display: 'grid', placeItems: 'center', borderRadius: 8, color: '#9bc6c7', background: 'rgba(111,181,183,.14)' }}><Shield size={15} /></span><div><div style={{ color: '#d0dcc3', fontSize: 12 }}>{ui.robe}</div><div style={{ color: '#9bb79b', fontFamily: 'var(--app-font-mono)', fontSize: 9 }}>ARMOR CLOTH</div></div></div>
        </section>
         <div className="gold-display" style={{ position: 'absolute', bottom: 22, right: 24, display: 'flex', alignItems: 'center', gap: 8, color: '#f3d681', fontFamily: 'var(--app-font-mono)', fontSize: 12 }} data-testid="text-gold"><Gem size={16} /> {ui.gold} GOLD</div>
        <div className="loot-stack" style={{ position: 'absolute', top: 124, right: 22, width: 248, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {lootToasts.map((toast) => <div className="loot-toast glass-panel" key={toast.id} data-testid={`toast-loot-${toast.id}`} style={{ borderRadius: 11, padding: '9px 11px', color: toast.color ?? '#ecdca9', fontFamily: 'var(--app-font-mono)', fontSize: 10, borderLeft: `3px solid ${toast.color ?? '#f1c861'}` }}><Sparkles size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{toast.rarity ? `${toast.rarity} · ` : ''}{toast.text}</div>)}
        </div>
         <button className="backpack-button" data-testid="button-backpack" onClick={openBackpack}><BackpackIcon size={16} /><span>BACKPACK</span><b>{backpack.length}</b></button>
        {levelFlash !== null && <div className="level-flare" data-testid="status-level-up" style={{ position: 'absolute', left: '50%', top: '47%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}><ChevronUp size={28} color="#f7dc86" style={{ margin: '0 auto -6px' }} /><div style={{ color: '#ffe6a0', fontFamily: 'var(--app-font-serif)', fontSize: 36, textShadow: '0 2px 18px rgba(248,201,90,.55)' }}>Level {levelFlash}</div><div style={{ color: '#d6e3bc', fontFamily: 'var(--app-font-mono)', fontSize: 10, letterSpacing: '.14em' }}>THE GROVE KNOWS YOUR NAME</div></div>}
         <div className="movement-hint" style={{ position: 'absolute', top: 96, left: 24, color: 'rgba(220,232,196,.58)', fontFamily: 'var(--app-font-mono)', fontSize: 10, letterSpacing: '.08em' }}>WASD / ARROWS TO MOVE · SPACE TO CAST</div>
        <div className="touch-controls">
          <div className="joystick-base" data-testid="control-joystick" onPointerMove={updateJoystick} onPointerDown={updateJoystick} onPointerUp={resetJoystick} onPointerCancel={resetJoystick} onPointerLeave={resetJoystick}><div className="joystick-knob" style={{ transform: `translate(${joystick.x}px, ${joystick.y}px)` }} /></div>
          <button className="cast-button" data-testid="button-cast-touch" onPointerDown={(event) => { event.preventDefault(); apiRef.current?.cast(); }} aria-label="Cast spell"><Sparkles size={30} strokeWidth={1.7} /></button>
        </div>
         {zonePickerOpen && <div className="zone-picker-scrim" data-testid="zone-picker">
           <section className="zone-picker glass-panel" role="dialog" aria-modal="true" aria-labelledby="zone-picker-title">
             <div className="zone-picker-head">
               <div><div className="zone-kicker">THE MAP OF THE GROVE</div><h2 id="zone-picker-title">Choose a zone</h2><p>Spend gold to open deeper paths. Your level, gear, and gold carry forward.</p></div>
               <button className="hud-button" onClick={closeZonePicker} aria-label="Close zones"><X size={17} /></button>
             </div>
             <div className="zone-list">
               {ZONES.map((zone) => {
                 const unlocked = unlockedZones.includes(zone.id);
                 const current = currentZone.id === zone.id;
                 const canAfford = ui.gold >= zone.unlockCost;
                 return <button key={zone.id} className={`zone-option${current ? ' is-current' : ''}${!unlocked ? ' is-locked' : ''}`} data-testid={`zone-option-${zone.id}`} onClick={() => selectZone(zone.id)} disabled={current}>
                   <span className="zone-swatch" style={{ background: `linear-gradient(135deg, ${zone.ground[0]}, ${zone.pond})` }}><span>{zone.id}</span></span>
                   <span className="zone-copy"><strong>{zone.name}</strong><small>{zone.subtitle}</small><em>{zone.enemyMultiplier > 1 ? `${Math.round((zone.enemyMultiplier - 1) * 100)}% tougher enemies` : 'A safe place to begin'}</em></span>
                   <span className={`zone-action${!unlocked && !canAfford ? ' needs-gold' : ''}`}>{current ? 'HERE' : unlocked ? 'ENTER' : <><LockKeyhole size={13} /> {zone.unlockCost}</>}</span>
                 </button>;
               })}
             </div>
           </section>
         </div>}
          {backpackOpen && <div className="backpack-scrim" data-testid="backpack-panel">
            <section className="backpack-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="backpack-title">
              <div className="backpack-head">
                <div><div className="zone-kicker">YOUR GEAR</div><h2 id="backpack-title">Backpack</h2><p>Gear picked up from fallen enemies stays here. Equip a stronger wand or robe whenever you find one.</p></div>
                <button className="hud-button" onClick={closeBackpack} aria-label="Close backpack"><X size={17} /></button>
              </div>
              <div className="equipped-summary">
                <div><span>WAND</span><strong>{ui.weapon}</strong><small>POWER {ui.damage}</small></div>
                <div><span>ROBE</span><strong>{ui.robe}</strong><small>+{ui.robeBonus} HEALTH</small></div>
              </div>
              <div className="gear-list">
                {backpack.length === 0 && <div className="empty-backpack"><BackpackIcon size={24} /><strong>Your backpack is empty</strong><span>Defeat slimes and goblins to find gear.</span></div>}
                {backpack.map((item) => {
                  const isBetter = item.bonus > currentGearBonus(item);
                  return <div className="gear-card" key={item.id} style={{ borderColor: `${rarityColors[item.rarity]}55` }}>
                    <div className="gear-icon" style={{ color: rarityColors[item.rarity] }}>{item.kind === 'wand' ? <WandSparkles size={18} /> : <Shield size={18} />}</div>
                    <div className="gear-copy"><strong style={{ color: rarityColors[item.rarity] }}>{item.name}</strong><span>{item.rarity} · {item.kind === 'wand' ? `+${item.bonus} power` : `+${item.bonus} health`}</span>{isBetter && !item.equipped && <em>STRONGER THAN EQUIPPED</em>}</div>
                    <button className={`gear-equip ${item.equipped ? 'is-equipped' : ''}`} disabled={item.equipped || !isBetter} onClick={() => apiRef.current?.equip(item.id)}>{item.equipped ? 'EQUIPPED' : isBetter ? 'EQUIP' : 'WEAKER'}</button>
                  </div>;
                })}
              </div>
            </section>
          </div>}
        {paused && <div className="pause-scrim" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 15 }}><div className="glass-panel" style={{ width: 'min(360px, calc(100% - 40px))', padding: 28, textAlign: 'center', borderRadius: 18 }}><div style={{ color: '#f3d581', fontFamily: 'var(--app-font-serif)', fontSize: 32, marginBottom: 5 }}>A quiet moment</div><p style={{ color: '#bed0b3', fontFamily: 'var(--app-font-mono)', fontSize: 11, lineHeight: 1.7, margin: '0 0 19px' }}>The clearing waits beneath the moon.</p><div style={{ display: 'flex', justifyContent: 'center', gap: 9 }}><button className="hud-button" data-testid="button-resume" onClick={togglePause} style={{ width: 120, display: 'flex', gap: 7, fontSize: 12 }}><Play size={14} /> Resume</button><button className="hud-button" data-testid="button-reset" onClick={() => apiRef.current?.reset()} aria-label="Reset adventure"><RotateCcw size={15} /></button></div></div></div>}
      </div>
    </main>
  );
}