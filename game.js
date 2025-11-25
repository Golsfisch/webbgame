// =============================================================
// game.js — Vollständiges Top-Down Shooter-Game
// Features: movement, shooting, enemies, enemy-shooting,
// powerups, weapon upgrades, particles, sounds (WebAudio),
// levels/waves, highscore (localStorage), pause, touch controls
// =============================================================

// ----------------------- Constants & Helpers -----------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (min, max) => Math.random() * (max - min) + min;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// ----------------------- Canvas & UI -----------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score') || (function(){ const d = document.createElement('div'); d.id='score'; document.body.appendChild(d); return d; })();
const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlayText');
const restartBtn = document.getElementById('restartBtn');

let W = canvas.width, H = canvas.height;
function fitCanvas() {
  const vw = Math.min(window.innerWidth - 40, 1200);
  const vh = Math.min(window.innerHeight - 40, 800);
  const scale = Math.min(vw / W, vh / H);
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ----------------------- Audio (WebAudio) -----------------------
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;

function playBeep({freq=440, type='sine', duration=0.06, gain=0.08, attack=0.005}={}) {
  if(!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, audioCtx.currentTime + attack);
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  o.stop(audioCtx.currentTime + duration + 0.02);
}

function playExplosionSound() {
  if(!audioCtx) return;
  // simple noise burst
  const bufferSize = audioCtx.sampleRate * 0.2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++){
    data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
  }
  const src = audioCtx.createBufferSource();
  const g = audioCtx.createGain();
  src.buffer = buffer;
  g.gain.value = 0.5;
  src.connect(g); g.connect(audioCtx.destination);
  src.start();
  // pitch shift simulation by playing with playbackRate
  src.playbackRate.value = 0.8 + Math.random()*0.6;
}

// ----------------------- Game State -----------------------
let state = {
  running: false,
  lastTime: 0,
  score: 0,
  highscore: Number(localStorage.getItem('topdown_highscore') || 0),
  enemies: [],
  bullets: [],
  eBullets: [],
  particles: [],
  powerups: [],
  spawnTimer: 0,
  spawnInterval: 1000,
  level: 1,
  wave: 1,
  paused: false
};

// ----------------------- Entities -----------------------
class Player {
  constructor(){
    this.reset();
  }
  reset(){
    this.x = W/2;
    this.y = H - 80;
    this.size = 28;
    this.speed = 360; // px/s
    this.cooldown = 0;
    this.fireRate = 160; // ms between shots
    this.alive = true;
    this.hp = 5;
    this.maxHp = 5;
    this.color = '#AEEFFF';
    this.weaponLevel = 1; // 1..4
    this.weaponTimer = 0; // duration for temporary upgrades
    this.scoreMultiplier = 1;
    this.shield = false;
  }
  update(dt, input) {
    if(!this.alive) return;
    // Movement
    this.x += input.dx * this.speed * dt;
    this.y += input.dy * this.speed * dt;
    this.x = clamp(this.x, this.size/2, W - this.size/2);
    this.y = clamp(this.y, this.size/2, H - this.size/2);

    // Shooting cooldown
    this.cooldown -= dt * 1000;
    if(input.shoot && this.cooldown <= 0) {
      this.cooldown = this.fireRate;
      this.fire();
    }

    // weapon timer
    if(this.weaponTimer > 0){
      this.weaponTimer -= dt;
      if(this.weaponTimer <= 0){
        this.weaponLevel = Math.max(1, this.weaponLevel - 1);
      }
    }
  }
  fire() {
    // different weapon levels
    const px = this.x, py = this.y - this.size/2;
    if(this.weaponLevel === 1){
      spawnBullet({x:px, y:py, vx:0, vy:-720});
      playBeep({freq:880, duration:0.04, gain:0.05});
    } else if(this.weaponLevel === 2){
      spawnBullet({x:px-10, y:py, vx:-60, vy:-700});
      spawnBullet({x:px+10, y:py, vx:60, vy:-700});
      playBeep({freq:920, duration:0.05, gain:0.06});
    } else if(this.weaponLevel === 3){
      spawnBullet({x:px, y:py, vx:0, vy:-820});
      spawnBullet({x:px-14, y:py+4, vx:-120, vy:-720});
      spawnBullet({x:px+14, y:py+4, vx:120, vy:-720});
      playBeep({freq:1000, duration:0.04, gain:0.07});
    } else if(this.weaponLevel >= 4){
      // rapid burst
      for(let i=0;i<3;i++){
        spawnBullet({x:px + rand(-8,8), y:py + i*2, vx:rand(-30,30), vy:-720 - i*40});
      }
      playBeep({freq:1200, duration:0.03, gain:0.05, type:'square'});
    }
  }
  draw(ctx){
    if(!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    // shield visual
    if(this.shield){
      ctx.beginPath();
      ctx.arc(0,0, this.size*0.8, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(90,180,255,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,180,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ship shape
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(12, 12);
    ctx.lineTo(6, 8);
    ctx.lineTo(-6, 8);
    ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();

    // HP bar small
    ctx.restore();
  }
}

class Bullet {
  constructor(x,y,vx,vy, owner='player'){
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.size = 6; this.life = 2.2; this.owner = owner;
    this.color = owner === 'player' ? '#ffd7a6' : '#ffb3b3';
  }
  update(dt){
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
  draw(ctx){
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size/2, 0, Math.PI*2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

class Enemy {
  constructor(x,y,type='basic'){
    this.x=x; this.y=y; this.type=type;
    this.size = (type==='basic'?28: (type==='big'?48:36));
    this.speed = (type==='basic'? rand(40,95) : (type==='big'? rand(18,45) : rand(35,70)));
    this.hp = (type==='basic'?1: (type==='big'?6:2));
    this.scoreVal = (type==='basic'?10: (type==='big'?120:30));
    this.color = (type==='basic'? '#ff6b6b' : (type==='big'? '#ffb86b' : '#ffa8d6'));
    this.shootTimer = rand(1.2, 3.0);
    this.angle = rand(0,Math.PI*2);
    this.t = 0;
  }
  update(dt){
    this.t += dt;
    if(this.type === 'basic'){
      this.y += this.speed * dt;
      this.x += Math.sin((this.y/30)+this.angle) * 14 * dt;
    } else if(this.type === 'big'){
      this.y += this.speed * dt * 0.6;
      this.x += Math.sin(this.t*0.4 + this.angle) * 26 * dt;
    } else if(this.type === 'shooter'){
      // move slowly and shoot
      this.y += Math.cos(this.t*0.6 + this.angle) * 10 * dt;
      this.x += Math.sin(this.t*0.8 + this.angle) * 18 * dt;
      this.shootTimer -= dt;
      if(this.shootTimer <= 0){
        this.shootTimer = rand(1.0, 2.2);
        // shoot toward player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const len = Math.hypot(dx,dy) || 1;
        const speed = 220 + Math.random()*120;
        spawnEnemyBullet({x:this.x, y:this.y, vx: (dx/len)*speed, vy:(dy/len)*speed});
      }
    }
  }
  draw(ctx){
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.beginPath();
    ctx.ellipse(0,0,this.size*0.6,this.size*0.9,0,0,Math.PI*2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0,0,this.size*0.22,0,Math.PI*2);
    ctx.fillStyle = '#2b2b2b';
    ctx.fill();
    ctx.restore();
  }
}

class Particle {
  constructor(x,y,vx,vy,life,size,color='#ffd7a6'){
    this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; this.size=size; this.color=color;
  }
  update(dt){
    this.x += this.vx*dt;
    this.y += this.vy*dt;
    this.vy += 300*dt;
    this.life -= dt;
  }
  draw(ctx){
    const alpha = clamp(this.life/1.0, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class Powerup {
  constructor(x,y,type){
    this.x=x; this.y=y; this.type=type;
    this.size=22; this.speed=80;
  }
  update(dt){ this.y += this.speed*dt; }
  draw(ctx){
    ctx.save(); ctx.translate(this.x, this.y);
    const colors = { health:'#3cff4a', firerate:'#a66bff', shield:'#5dcfff', weapon:'#ffd36b', score:'#ff6bd6' };
    ctx.fillStyle = colors[this.type] || '#fff';
    ctx.beginPath(); ctx.arc(0,0,this.size/2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = '12px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const letters = { health:'H', firerate:'F', shield:'S', weapon:'W', score:'+' };
    ctx.fillText(letters[this.type]||'?',0,0);
    ctx.restore();
  }
}

// ----------------------- Spawners -----------------------
function spawnBullet(opts){ state.bullets.push(new Bullet(opts.x, opts.y, opts.vx, opts.vy, 'player')); }
function spawnEnemyBullet(opts){ state.eBullets.push(new Bullet(opts.x, opts.y, opts.vx, opts.vy, 'enemy')); }

function spawnEnemyWave(count=1){
  for(let i=0;i<count;i++){
    const r = Math.random();
    if(r < 0.7){
      const x = rand(40, W-40);
      state.enemies.push(new Enemy(x, -40, 'basic'));
    } else if(r < 0.9){
      const x = rand(60, W-60);
      state.enemies.push(new Enemy(x, -80, 'shooter'));
    } else {
      const x = rand(80, W-80);
      state.enemies.push(new Enemy(x, -120, 'big'));
    }
  }
}

function spawnBoss(){
  // Boss = a strong big enemy that moves horizontally
  const boss = new Enemy(W/2, -140, 'big');
  boss.hp = 18 + state.level*6;
  boss.scoreVal = 500 + state.level*200;
  boss.speed = 18;
  boss.isBoss = true;
  state.enemies.push(boss);
}

// ----------------------- Particles & Explosions -----------------------
function makeExplosion(x,y,power=12,color='#ffd7a6'){
  for(let i=0;i<power;i++){
    const a = rand(0, Math.PI*2);
    const s = rand(80, 320);
    const vx = Math.cos(a)*s;
    const vy = Math.sin(a)*s * 0.9;
    state.particles.push(new Particle(x,y,vx,vy, rand(0.4,1.2), rand(2,5), color));
  }
  playExplosionSound();
}

// ----------------------- Powerup Logic -----------------------
function dropPowerup(x,y){
  if(Math.random() > 0.12) return;
  const types = ['health','firerate','shield','weapon','score'];
  const pick = types[Math.floor(Math.random()*types.length)];
  state.powerups.push(new Powerup(x,y,pick));
}

function applyPowerup(type){
  if(type === 'health'){
    player.hp = Math.min(player.maxHp, player.hp + 2);
    makeExplosion(player.x, player.y, 8, '#3cff4a');
  } else if(type === 'firerate'){
    player.fireRate = Math.max(70, player.fireRate - 40);
    setTimeout(()=>{ player.fireRate = Math.min(320, player.fireRate + 40); }, 15000);
  } else if(type === 'shield'){
    player.shield = true;
    setTimeout(()=>{ player.shield = false; }, 12000);
  } else if(type === 'weapon'){
    player.weaponLevel = Math.min(5, player.weaponLevel + 1);
    player.weaponTimer += 12.0;
  } else if(type === 'score'){
    player.scoreMultiplier = 2;
    setTimeout(()=>{ player.scoreMultiplier = 1; }, 15000);
  }
  playBeep({freq: 1200, duration:0.06, gain:0.07});
}

// ----------------------- Player & Input -----------------------
const player = new Player();

const input = {
  left:false,right:false,up:false,down:false,shoot:false,dx:0,dy:0,
  touchTarget: null
};

function updateInputFromKeys() {
  input.dx = (input.right?1:0) - (input.left?1:0);
  input.dy = (input.down?1:0) - (input.up?1:0);
  const len = Math.hypot(input.dx, input.dy);
  if(len>1){ input.dx/=len; input.dy/=len; }
}

// keyboard
window.addEventListener('keydown', e=>{
  if(e.key === 'ArrowLeft' || e.key==='a') input.left = true;
  if(e.key === 'ArrowRight' || e.key==='d') input.right = true;
  if(e.key === 'ArrowUp' || e.key==='w') input.up = true;
  if(e.key === 'ArrowDown' || e.key==='s') input.down = true;
  if(e.key === ' ' || e.key === 'z') input.shoot = true;
  if(e.key === 'p' || e.key === 'P') togglePause();
  if(e.key === 'Enter' && !state.running) startGame();
  updateInputFromKeys();
});
window.addEventListener('keyup', e=>{
  if(e.key === 'ArrowLeft' || e.key==='a') input.left = false;
  if(e.key === 'ArrowRight' || e.key==='d') input.right = false;
  if(e.key === 'ArrowUp' || e.key==='w') input.up = false;
  if(e.key === 'ArrowDown' || e.key==='s') input.down = false;
  if(e.key === ' ' || e.key === 'z') input.shoot = false;
  updateInputFromKeys();
});

// Touch support
canvas.addEventListener('touchstart', (ev)=>{
  ev.preventDefault();
  const t = ev.changedTouches[0];
  input.touchTarget = getCanvasPos(t);
  input.shoot = true;
});
canvas.addEventListener('touchmove', (ev)=>{
  ev.preventDefault();
  const t = ev.changedTouches[0];
  input.touchTarget = getCanvasPos(t);
});
canvas.addEventListener('touchend', (ev)=>{
  ev.preventDefault();
  input.touchTarget = null;
  input.shoot = false;
});
function getCanvasPos(touch){
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
}
function applyTouchMovement(dt){
  if(!input.touchTarget) return;
  const tx = input.touchTarget.x, ty = input.touchTarget.y;
  const vx = tx - player.x, vy = ty - player.y;
  const d = Math.hypot(vx, vy);
  if(d > 6){
    player.x += (vx/d) * player.speed * dt * 0.9;
    player.y += (vy/d) * player.speed * dt * 0.9;
  }
}

// ----------------------- Game Loop / Update -----------------------
function updateScoreUI(){
  scoreEl.textContent = `Score: ${Math.floor(state.score)} | Highscore: ${state.highscore} | HP: ${player.hp}/${player.maxHp}`;
}

function gameOver(){
  state.running = false;
  player.alive = false;
  // update highscore
  const s = Math.floor(state.score);
  if(s > state.highscore){
    state.highscore = s;
    localStorage.setItem('topdown_highscore', state.highscore);
  }
  overlayText.textContent = `Game Over — Score: ${s}\nHighscore: ${state.highscore}`;
  overlay.classList.remove('hidden');
}

function togglePause(){
  if(!state.running) return;
  state.paused = !state.paused;
  if(state.paused){
    overlayText.textContent = `Paused\nPress P to resume`;
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
    state.lastTime = 0;
    requestAnimationFrame(loop);
  }
}

function update(dt){
  if(!state.running || state.paused) return;

  // spawn logic with scaling difficulty
  state.spawnTimer += dt * 1000;
  const interval = Math.max(300, state.spawnInterval - state.score * 0.4 - state.level*20);
  if(state.spawnTimer > interval){
    state.spawnTimer = 0;
    const count = Math.min(4, 1 + Math.floor(state.level/2) + Math.floor(state.score/200));
    spawnEnemyWave(count);
  }

  // progressive level/wave
  if(state.score > state.level * 500){
    state.level++;
    state.wave++;
    // occasional boss
    if(state.level % 3 === 0){
      spawnBoss();
    }
  }

  // Input -> player
  if(input.touchTarget) applyTouchMovement(dt);
  else {
    updateInputFromKeys();
    player.update(dt, input);
  }
  // also update player (if touch movement was used, still allow shooting)
  if(!input.touchTarget) player.update(dt, input);

  // bullets update
  for(let i=state.bullets.length-1;i>=0;i--){
    const b = state.bullets[i];
    b.update(dt);
    if(b.life <= 0 || b.y < -60 || b.y > H+60 || b.x < -80 || b.x > W+80) state.bullets.splice(i,1);
  }
  // enemy bullets
  for(let i=state.eBullets.length-1;i>=0;i--){
    const b = state.eBullets[i];
    b.update(dt);
    if(b.life <= 0 || b.y < -60 || b.y > H+60 || b.x < -80 || b.x > W+80) state.eBullets.splice(i,1);
  }

  // enemies
  for(let i=state.enemies.length-1;i>=0;i--){
    const e = state.enemies[i];
    e.update(dt);

    if(e.y > H + 120){
      // if boss passes player -> game over (tough)
      if(e.isBoss) {
        gameOver();
        return;
      }
      state.enemies.splice(i,1);
      continue;
    }

    // collision: bullets -> enemy
    for(let j=state.bullets.length-1;j>=0;j--){
      const b = state.bullets[j];
      const r = (e.size*0.5 + b.size*0.5);
      if(dist2(e,b) <= r*r){
        // hit
        e.hp -= 1;
        state.bullets.splice(j,1);
        makeExplosion(b.x, b.y, 6, '#ffd7a6');
        if(e.hp <= 0){
          // enemy died
          const gained = e.scoreVal * (player.scoreMultiplier || 1);
          state.score += gained;
          updateScoreUI();
          makeExplosion(e.x, e.y, Math.min(36, e.size * 0.8), '#ffcc66');
          dropPowerup(e.x, e.y);
          state.enemies.splice(i,1);
        }
        break;
      }
    }

    // collision: enemy -> player
    if(player.alive){
      const r = (e.size*0.5 + player.size*0.5);
      if(dist2(e, player) <= r*r){
        // if shield active, consume
        if(player.shield){
          player.shield = false;
          makeExplosion(player.x, player.y, 18, '#5dcfff');
          state.enemies.splice(i,1);
          continue;
        }
        // take damage
        player.hp -= 2;
        makeExplosion(player.x, player.y, 12, '#ff6b6b');
        // remove enemy
        state.enemies.splice(i,1);
        if(player.hp <= 0){
          gameOver();
          return;
        } else {
          updateScoreUI();
        }
      }
    }
  }

  // enemy bullets -> player
  for(let i=state.eBullets.length-1;i>=0;i--){
    const b = state.eBullets[i];
    const r = (b.size*0.5 + player.size*0.5);
    if(dist2(b, player) <= r*r){
      state.eBullets.splice(i,1);
      if(player.shield){
        player.shield = false;
        makeExplosion(player.x, player.y, 10, '#5dcfff');
      } else {
        player.hp -= 1;
        makeExplosion(player.x, player.y, 8, '#ff6b6b');
        if(player.hp <= 0){
          gameOver();
          return;
        } else updateScoreUI();
      }
    }
  }

  // particles
  for(let i=state.particles.length-1;i>=0;i--){
    const p = state.particles[i];
    p.update(dt);
    if(p.life <= 0) state.particles.splice(i,1);
  }

  // powerups
  for(let i=state.powerups.length-1;i>=0;i--){
    const p = state.powerups[i];
    p.update(dt);
    if(p.y > H + 40){ state.powerups.splice(i,1); continue; }
    const r = (p.size/2 + player.size/2);
    if(dist2(p, player) <= r*r){
      applyPowerup(p.type);
      state.powerups.splice(i,1);
    }
  }
}

// ----------------------- Draw -----------------------
function drawBG(ctx){
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0,0,W,H);
  // faint stars
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#ffffff';
  for(let x=0;x<W;x+=60){
    ctx.fillRect(x, (Date.now()/30)%40 - 40, 2, H+80);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  drawBG(ctx);

  // player
  player.draw(ctx);

  // bullets
  for(const b of state.bullets) b.draw(ctx);
  for(const b of state.eBullets) b.draw(ctx);

  // enemies
  for(const e of state.enemies) e.draw(ctx);

  // powerups
  for(const p of state.powerups) p.draw(ctx);

  // particles
  for(const p of state.particles) p.draw(ctx);

  // HUD: score, HP, weapon level
  ctx.fillStyle = '#E6F1FF';
  ctx.font = '16px Inter, Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${Math.floor(state.score)}  High: ${state.highscore}`, 14, 20);

  // HP bar
  const hpX = 14, hpY = 36, hpW = 160, hpH = 12;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(hpX, hpY, hpW, hpH);
  const hpFrac = player.hp / player.maxHp;
  ctx.fillStyle = '#3cff4a';
  ctx.fillRect(hpX, hpY, hpW * clamp(hpFrac,0,1), hpH);
  ctx.strokeStyle = '#0008';
  ctx.strokeRect(hpX, hpY, hpW, hpH);
  ctx.fillStyle = '#fff';
  ctx.fillText(`HP ${player.hp}/${player.maxHp}`, hpX + hpW + 8, hpY + hpH - 1);

  // weapon and shield indicator
  ctx.fillText(`Weapon Lv: ${player.weaponLevel}`, 14, hpY + 36);
  ctx.fillText(`Shield: ${player.shield ? 'ON' : 'OFF'}`, 14, hpY + 56);

  // center crosshair
  ctx.beginPath();
  ctx.arc(player.x, player.y, 2.5, 0, Math.PI*2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

// ----------------------- Main Loop -----------------------
function loop(ts){
  if(!state.lastTime) state.lastTime = ts;
  const dt = Math.min(0.05, (ts - state.lastTime) / 1000);
  state.lastTime = ts;

  update(dt);
  draw();

  if(state.running && !state.paused) requestAnimationFrame(loop);
}

// ----------------------- Controls: Start / Restart -----------------------
function resetState(){
  state.running = false;
  state.lastTime = 0;
  state.score = 0;
  state.enemies = [];
  state.bullets = [];
  state.eBullets = [];
  state.particles = [];
  state.powerups = [];
  state.spawnTimer = 0;
  state.spawnInterval = 1000;
  state.level = 1;
  state.wave = 1;
  state.paused = false;
  updateScoreUI();
}

function startGame(){
  overlay.classList.add('hidden');
  resetState();
  player.reset();
  state.running = true;
  state.lastTime = 0;
  requestAnimationFrame(loop);
}

startBtn && startBtn.addEventListener('click', startGame);
restartBtn && restartBtn.addEventListener('click', startGame);

// Kick off initial draw and UI
resetState();
draw();

// allow starting with Enter key
window.addEventListener('keydown', e => {
  if(e.key === 'Enter' && !state.running){
    startGame();
  }
});
