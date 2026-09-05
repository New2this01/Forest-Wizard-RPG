import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUp, Gem, Pause, Play, RotateCcw, Shield, Sparkles, WandSparkles } from 'lucide-react';

type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';
type EnemyKind = 'slime' | 'goblin';
type LootKind = 'wand' | 'robe';
type Vec = { x: number; y: number };
type UiState = {
  hp: number; maxHp: number; mana: number; maxMana: number; xp: number; nextXp: number;
  level: number; gold: number; weapon: string; robe: string; damage: number;
};
type Obstacle = { x: number; y: number; r: number; type: 'tree' | 'rock' | 'bush' };
type Enemy = {
  id: number; kind: EnemyKind; x: number; y: number; r: number; hp: number; maxHp: number;
  speed: number; aggro: number; hitCooldown: number; wander: number; angle: number; hurt: number;
};
type Projectile = { x: number; y: number; vx: number; vy: number; life: number; damage: number; targetId: number | null };
type Pickup = { id: number; x: number; y: number; kind: 'gold' | LootKind; amount: number; name?: string; rarity?: Rarity; bonus?: number; bob: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type FloatText = { x: number; y: number; value: string; color: string; life: number; maxLife: number };
type GameState = {
  player: UiState & { x: number; y: number; r: number; lastDx: number; lastDy: number; hurt: number };
  enemies: Enemy[]; projectiles: Projectile[]; pickups: Pickup[]; particles: Particle[]; texts: FloatText[];
  obstacles: Obstacle[]; elapsed: number; spawnId: number;
};

const WORLD = { width: 2600, height: 1700 };
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

function createObstacles(): Obstacle[] {
  const random = seeded(44);
  const obstacles: Obstacle[] = [
    { x: 420, y: 350, r: 50, type: 'tree' }, { x: 610, y: 1240, r: 58, type: 'tree' },
    { x: 2120, y: 360, r: 62, type: 'tree' }, { x: 2250, y: 1170, r: 52, type: 'tree' },
    { x: 1080, y: 280, r: 42, type: 'tree' }, { x: 1460, y: 1420, r: 56, type: 'tree' },
    { x: 780, y: 700, r: 34, type: 'rock' }, { x: 1860, y: 580, r: 43, type: 'rock' },
    { x: 390, y: 980, r: 32, type: 'rock' }, { x: 2070, y: 920, r: 36, type: 'rock' },
  ];
  for (let i = 0; i < 28; i += 1) {
    const x = 90 + random() * 2420; const y = 80 + random() * 1540;
    if (distance({ x, y }, { x: 1300, y: 850 }) > 320) obstacles.push({ x, y, r: 18 + random() * 14, type: 'bush' });
  }
  return obstacles;
}

function makeGame(): GameState {
  const random = seeded(912);
  const obstacles = createObstacles();
  const enemies: Enemy[] = [];
  const spots: Vec[] = [
    { x: 430, y: 560 }, { x: 720, y: 330 }, { x: 970, y: 1180 }, { x: 1320, y: 330 },
    { x: 1780, y: 380 }, { x: 2180, y: 650 }, { x: 2260, y: 1290 }, { x: 1740, y: 1240 },
    { x: 480, y: 1380 }, { x: 840, y: 1450 }, { x: 1960, y: 900 }, { x: 380, y: 840 },
  ];
  spots.forEach((spot, index) => {
    const kind: EnemyKind = index % 3 === 0 ? 'goblin' : 'slime';
    enemies.push({
      id: index + 1, kind, x: spot.x, y: spot.y, r: kind === 'goblin' ? 19 : 22,
      hp: kind === 'goblin' ? 64 : 45, maxHp: kind === 'goblin' ? 64 : 45,
      speed: kind === 'goblin' ? 72 : 50, aggro: kind === 'goblin' ? 380 : 330,
      hitCooldown: 0, wander: random() * 5, angle: random() * Math.PI * 2, hurt: 0,
    });
  });
  return {
    player: { x: 1300, y: 850, r: 17, hp: 100, maxHp: 100, mana: 100, maxMana: 100, xp: 0, nextXp: 100, level: 1, gold: 42, weapon: 'Ashwood Wand', robe: 'Mossweave Robe', damage: 22, lastDx: 1, lastDy: 0, hurt: 0 },
    enemies, projectiles: [], pickups: [], particles: [], texts: [], obstacles, elapsed: 0, spawnId: 100,
  };
}

function blocked(x: number, y: number, radius: number, obstacles: Obstacle[]) {
  return obstacles.some((obstacle) => Math.hypot(x - obstacle.x, y - obstacle.y) < radius + obstacle.r * (obstacle.type === 'tree' ? .65 : .78));
}

function moveWithCollision(point: { x: number; y: number }, dx: number, dy: number, radius: number, obstacles: Obstacle[]) {
  const nx = clamp(point.x + dx, radius + 28, WORLD.width - radius - 28);
  const ny = clamp(point.y + dy, radius + 28, WORLD.height - radius - 28);
  if (!blocked(nx, point.y, radius, obstacles)) point.x = nx;
  if (!blocked(point.x, ny, radius, obstacles)) point.y = ny;
}

function chooseLoot(random: () => number, enemy: Enemy): { kind: LootKind; name: string; rarity: Rarity; bonus: number } {
  const roll = random();
  const rarity: Rarity = roll > .985 ? 'Mythic' : roll > .95 ? 'Legendary' : roll > .83 ? 'Epic' : roll > .62 ? 'Rare' : roll > .3 ? 'Uncommon' : 'Common';
  const kind: LootKind = random() > .48 ? 'wand' : 'robe';
  const names: Record<LootKind, string[]> = {
    wand: ['Bramble Wand', 'Moonreed Staff', 'Foxfire Rod', 'Starling Scepter', 'Glimmerbranch'],
    robe: ['Fernstitch Robe', 'Nightbloom Mantle', 'Hearthmoss Cloak', 'Silverleaf Vestment', 'Dewfall Cowl'],
  };
  const prefix = rarity === 'Mythic' ? 'Astral' : rarity === 'Legendary' ? 'Sunken' : rarity === 'Epic' ? 'Runed' : '';
  const bonus = Math.round(4 + rarityOrder[rarity] * 5 + random() * 7);
  return { kind, name: `${prefix ? `${prefix} ` : ''}${names[kind][Math.floor(random() * names[kind].length)]}`, rarity, bonus };
}

export default function ForestWizardGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(makeGame());
  const keysRef = useRef<Set<string>>(new Set());
  const inputRef = useRef({ x: 0, y: 0 });
  const pauseRef = useRef(false);
  const apiRef = useRef<{ cast: () => void; reset: () => void } | null>(null);
  const [ui, setUi] = useState<UiState>(gameRef.current.player);
  const [paused, setPaused] = useState(false);
  const [lootToasts, setLootToasts] = useState<Array<{ id: number; text: string; rarity?: Rarity; color?: string }>>([]);
  const [levelFlash, setLevelFlash] = useState<number | null>(null);
  const [joystick, setJoystick] = useState({ x: 0, y: 0 });
  const toastId = useRef(0);

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
      gameRef.current = makeGame();
      Object.assign(game, gameRef.current);
      setUi(game.player);
      setLootToasts([]);
      setLevelFlash(null);
      pauseRef.current = false;
      setPaused(false);
    };
    apiRef.current = { cast, reset };

    const update = (dt: number) => {
      if (pauseRef.current) return;
      game.elapsed += dt;
      const player = game.player;
      const keyboardX = (keysRef.current.has('d') || keysRef.current.has('arrowright') ? 1 : 0) - (keysRef.current.has('a') || keysRef.current.has('arrowleft') ? 1 : 0);
      const keyboardY = (keysRef.current.has('s') || keysRef.current.has('arrowdown') ? 1 : 0) - (keysRef.current.has('w') || keysRef.current.has('arrowup') ? 1 : 0);
      let mx = inputRef.current.x || keyboardX; let my = inputRef.current.y || keyboardY;
      const length = Math.hypot(mx, my);
      if (length > 1) { mx /= length; my /= length; }
      if (Math.hypot(mx, my) > .08) { player.lastDx = mx; player.lastDy = my; moveWithCollision(player, mx * 185 * dt, my * 185 * dt, player.r, game.obstacles); }
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
        moveWithCollision(enemy, ex * enemy.speed * dt, ey * enemy.speed * dt, enemy.r, game.obstacles);
        if (range < enemy.r + player.r + 4 && enemy.hitCooldown <= 0) {
          enemy.hitCooldown = 1.05; player.hp = Math.max(0, player.hp - (enemy.kind === 'goblin' ? 9 : 6)); player.hurt = .3;
          text(player.x, player.y - 30, `-${enemy.kind === 'goblin' ? 9 : 6}`, '#f18b78'); burst(player.x, player.y, '#f18b78', 5);
          if (player.hp <= 0) { player.hp = player.maxHp; player.mana = player.maxMana; player.x = 1300; player.y = 850; text(player.x, player.y - 45, 'The grove restores you', '#f7d881'); }
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
            const oldBonus = pickup.kind === 'wand' ? player.damage - 22 : player.maxHp - 100;
            if ((pickup.bonus ?? 0) > oldBonus) {
              if (pickup.kind === 'wand') { player.damage = 22 + (pickup.bonus ?? 0); player.weapon = pickup.name ?? 'New Wand'; }
              else { player.maxHp += pickup.bonus ?? 0; player.hp = Math.min(player.maxHp, player.hp + (pickup.bonus ?? 0)); player.robe = pickup.name ?? 'New Robe'; }
              addToast(`${pickup.name} equipped`, pickup.rarity, rarityColors[pickup.rarity ?? 'Common']);
            } else addToast(`${pickup.name} found`, pickup.rarity, rarityColors[pickup.rarity ?? 'Common']);
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
        game.enemies.push({ id: game.spawnId++, kind: random() > .65 ? 'goblin' : 'slime', x: edge ? (random() > .5 ? 130 : 2470) : 150 + random() * 2300, y: edge ? 150 + random() * 1400 : (random() > .5 ? 120 : 1580), r: random() > .65 ? 19 : 22, hp: random() > .65 ? 64 : 45, maxHp: random() > .65 ? 64 : 45, speed: random() > .65 ? 72 : 50, aggro: 360, hitCooldown: 0, wander: 2, angle: random() * 6, hurt: 0 });
      }
    };

    const draw = () => {
      context.clearRect(0, 0, viewW, viewH);
      const player = game.player;
      const camX = clamp(game.player.x - viewW / 2, 0, WORLD.width - viewW);
      const camY = clamp(game.player.y - viewH / 2, 0, WORLD.height - viewH);
      context.save(); context.translate(-camX, -camY);
      context.fillStyle = '#163f39'; context.fillRect(camX, camY, viewW, viewH);
      const tile = 64; const startX = Math.floor(camX / tile) * tile; const startY = Math.floor(camY / tile) * tile;
      for (let x = startX; x < camX + viewW + tile; x += tile) for (let y = startY; y < camY + viewH + tile; y += tile) {
        context.fillStyle = ((x / tile + y / tile) % 2 === 0) ? '#1b4a3e' : '#1d4d40'; context.fillRect(x, y, tile + 1, tile + 1);
        context.fillStyle = 'rgba(143, 184, 111, .09)'; context.beginPath(); context.arc(x + 15 + ((y / 7) % 19), y + 24, 1.4, 0, Math.PI * 2); context.fill();
      }
      // Moonlit paths and pond.
      context.fillStyle = '#8a805b'; context.globalAlpha = .18; context.beginPath(); context.moveTo(1260, 1700); context.bezierCurveTo(1160, 1300, 1380, 1110, 1300, 850); context.bezierCurveTo(1280, 590, 1410, 290, 1560, 0); context.lineTo(1680, 0); context.bezierCurveTo(1490, 340, 1430, 580, 1450, 850); context.bezierCurveTo(1500, 1180, 1340, 1390, 1400, 1700); context.closePath(); context.fill();
      context.fillStyle = '#285f68'; context.beginPath(); context.ellipse(400, 320, 190, 90, -.2, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1;
      context.strokeStyle = 'rgba(151, 220, 209, .25)'; context.lineWidth = 3; context.stroke();
      game.obstacles.forEach((obstacle) => {
        if (obstacle.type === 'tree') {
          context.fillStyle = 'rgba(3, 24, 24, .3)'; context.beginPath(); context.ellipse(obstacle.x, obstacle.y + 32, obstacle.r * .95, obstacle.r * .33, 0, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#4e3329'; context.beginPath(); context.roundRect(obstacle.x - 12, obstacle.y - 4, 24, obstacle.r + 39, 8); context.fill();
          context.fillStyle = '#102f30'; context.beginPath(); context.arc(obstacle.x - 21, obstacle.y - 25, obstacle.r * .7, 0, Math.PI * 2); context.arc(obstacle.x + 25, obstacle.y - 31, obstacle.r * .72, 0, Math.PI * 2); context.arc(obstacle.x, obstacle.y - 55, obstacle.r * .68, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#1d5750'; context.beginPath(); context.arc(obstacle.x - 17, obstacle.y - 29, obstacle.r * .56, 0, Math.PI * 2); context.arc(obstacle.x + 22, obstacle.y - 33, obstacle.r * .56, 0, Math.PI * 2); context.arc(obstacle.x, obstacle.y - 58, obstacle.r * .5, 0, Math.PI * 2); context.fill();
        } else if (obstacle.type === 'rock') {
          context.fillStyle = 'rgba(3,24,24,.25)'; context.beginPath(); context.ellipse(obstacle.x, obstacle.y + 15, obstacle.r * 1.1, 10, 0, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#647671'; context.beginPath(); context.ellipse(obstacle.x, obstacle.y, obstacle.r, obstacle.r * .72, -.2, 0, Math.PI * 2); context.fill();
          context.fillStyle = '#8ea298'; context.beginPath(); context.ellipse(obstacle.x - 8, obstacle.y - 6, obstacle.r * .45, obstacle.r * .22, -.3, 0, Math.PI * 2); context.fill();
        } else {
          context.fillStyle = '#2b6a4b'; context.beginPath(); context.arc(obstacle.x - 9, obstacle.y + 4, obstacle.r * .7, 0, Math.PI * 2); context.arc(obstacle.x + 9, obstacle.y + 1, obstacle.r * .67, 0, Math.PI * 2); context.fill();
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
      if (now - lastUi > 100) { setUi({ ...game.player }); lastUi = now; }
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

  return (
    <main className="game-shell" data-testid="game-shell">
      <canvas ref={canvasRef} className="game-canvas" data-testid="game-canvas" aria-label="Forest Wizard playable world" />
      <div className="hud-layer">
        <section className="hud-top" style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
          <div className="game-brand" style={{ color: '#f6d779', fontFamily: 'var(--app-font-serif)', fontSize: 23, lineHeight: 1 }}>
            Forest Wizard <span style={{ color: '#a9c79c', fontFamily: 'var(--app-font-sans)', fontSize: 12, letterSpacing: '.13em', textTransform: 'uppercase' }}>RPG</span>
            <div className="brand-subtitle" style={{ color: 'rgba(215,230,193,.65)', fontFamily: 'var(--app-font-mono)', fontSize: 10, marginTop: 8, letterSpacing: '.06em' }}>THE MOONLIT CLEARING</div>
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
        <div style={{ position: 'absolute', bottom: 22, right: 24, display: 'flex', alignItems: 'center', gap: 8, color: '#f3d681', fontFamily: 'var(--app-font-mono)', fontSize: 12 }} data-testid="text-gold"><Gem size={16} /> {ui.gold} GOLD</div>
        <div className="loot-stack" style={{ position: 'absolute', top: 124, right: 22, width: 248, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {lootToasts.map((toast) => <div className="loot-toast glass-panel" key={toast.id} data-testid={`toast-loot-${toast.id}`} style={{ borderRadius: 11, padding: '9px 11px', color: toast.color ?? '#ecdca9', fontFamily: 'var(--app-font-mono)', fontSize: 10, borderLeft: `3px solid ${toast.color ?? '#f1c861'}` }}><Sparkles size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{toast.rarity ? `${toast.rarity} · ` : ''}{toast.text}</div>)}
        </div>
        {levelFlash !== null && <div className="level-flare" data-testid="status-level-up" style={{ position: 'absolute', left: '50%', top: '47%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}><ChevronUp size={28} color="#f7dc86" style={{ margin: '0 auto -6px' }} /><div style={{ color: '#ffe6a0', fontFamily: 'var(--app-font-serif)', fontSize: 36, textShadow: '0 2px 18px rgba(248,201,90,.55)' }}>Level {levelFlash}</div><div style={{ color: '#d6e3bc', fontFamily: 'var(--app-font-mono)', fontSize: 10, letterSpacing: '.14em' }}>THE GROVE KNOWS YOUR NAME</div></div>}
        <div style={{ position: 'absolute', top: 96, left: 24, color: 'rgba(220,232,196,.58)', fontFamily: 'var(--app-font-mono)', fontSize: 10, letterSpacing: '.08em' }}>WASD / ARROWS TO MOVE · SPACE TO CAST</div>
        <div className="touch-controls">
          <div className="joystick-base" data-testid="control-joystick" onPointerMove={updateJoystick} onPointerDown={updateJoystick} onPointerUp={resetJoystick} onPointerCancel={resetJoystick} onPointerLeave={resetJoystick}><div className="joystick-knob" style={{ transform: `translate(${joystick.x}px, ${joystick.y}px)` }} /></div>
          <button className="cast-button" data-testid="button-cast-touch" onPointerDown={(event) => { event.preventDefault(); apiRef.current?.cast(); }} aria-label="Cast spell"><Sparkles size={30} strokeWidth={1.7} /></button>
        </div>
        {paused && <div className="pause-scrim" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 15 }}><div className="glass-panel" style={{ width: 'min(360px, calc(100% - 40px))', padding: 28, textAlign: 'center', borderRadius: 18 }}><div style={{ color: '#f3d581', fontFamily: 'var(--app-font-serif)', fontSize: 32, marginBottom: 5 }}>A quiet moment</div><p style={{ color: '#bed0b3', fontFamily: 'var(--app-font-mono)', fontSize: 11, lineHeight: 1.7, margin: '0 0 19px' }}>The clearing waits beneath the moon.</p><div style={{ display: 'flex', justifyContent: 'center', gap: 9 }}><button className="hud-button" data-testid="button-resume" onClick={togglePause} style={{ width: 120, display: 'flex', gap: 7, fontSize: 12 }}><Play size={14} /> Resume</button><button className="hud-button" data-testid="button-reset" onClick={() => apiRef.current?.reset()} aria-label="Reset adventure"><RotateCcw size={15} /></button></div></div></div>}
      </div>
    </main>
  );
}