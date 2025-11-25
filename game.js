// Top-Down Shooter - Single File Starter
// Save as game.js and open index.html in a browser.

// ----------------------- Utilities -----------------------
let highscore = Number(localStorage.getItem("topdown_highscore") || 0);





const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (min, max) => Math.random() * (max - min) + min;
const dist2 = (a, b) => (a.x - b.x)**2 + (a.y - b.y)**2;

// ----------------------- Canvas + UI -----------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlayText');
const restartBtn = document.getElementById('restartBtn');

let W = canvas.width, H = canvas.height;

// Responsive canvas (keeps internal resolution fixed but fits visually)
function fitCanvas() {
  const vw = Math.min(window.innerWidth - 40, 1200);
  const vh = Math.min(window.innerHeight - 40, 800);
  const scale = Math.min(vw / W, vh / H);
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ----------------------- Game State -----------------------
let state = {
  running: false,
  score: 0,
  lastTime: 0,
  enemies: [],
  bullets: [],
  particles: [],
  spawnTimer: 0,
  spawnInterval: 1000, // ms
};

function resetState() {
  state.running = false;
  state.score = 0;
  state.enemies = [];
  state.bullets = [];
  state.particles = [];
  state.spawnTimer = 0;
  updateScore();
}

// ----------------------- Entities -----------------------
class Player {
  constructor() {
    this.x = W/2;
    this.y = H - 80;
    this.size = 26;
    this.speed = 330; // px/s
    this.cooldown = 0;
    this.fireRate = 160; // ms between shots
    this.alive = true;
    this.color = '#E6F1FF';
  }
  update(dt, input) {
    if(!this.alive) return;
    // Movement
    this.x += input.dx * this.speed * dt;
    this.y += input.dy * this.speed * dt;
    // keep in bounds
    this.x = clamp(this.x, this.size/2, W - this.size/2);
    this.y = clamp(this.y, this.size/2, H - this.size/2);

    // Shooting
    this.cooldown -= dt * 1000;
    if(input.shoot && this.cooldown <= 0) {
      this.cooldown = this.fireRate;
      spawnBullet({x: this.x, y: this.y - this.size/2, vx: 0, vy: -700});
      // twin bullets
      spawnBullet({x: this.x - 12, y: this.y - this.size/2 + 4, vx: -60, vy: -650});
      spawnBullet({x: this.x + 12, y: this.y - this.size/2 + 4, vx: 60, vy: -650});
    }
  }
  draw(ctx) {
    if(!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
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
    ctx.restore();
  }
}

class Bullet {
  constructor(x,y,vx,vy) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.size = 6;
    this.life = 2.0; // seconds
    this.color = '#ffd7a6';
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size/2, 0, Math.PI*2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

class Enemy {
  constructor(x,y, type='basic') {
    this.x = x; this.y = y; this.type = type;
    this.size = (type==='basic'?28:44);
    this.speed = (type==='basic'? rand(40,90) : rand(20,55));
    this.hp = (type==='basic'?1:3);
    this.scoreVal = (type==='basic'?10:40);
    this.color = (type==='basic'? '#ff6b6b' : '#ffb86b');
    this.angle = 0;
  }
  update(dt) {
    // Basic downward movement with small horizontal sinus
    this.y += this.speed * dt;
    this.x += Math.sin((this.y/30)+this.angle) * 18 * dt;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.beginPath();
    ctx.ellipse(0,0,this.size*0.6,this.size*0.9,0,0,Math.PI*2);
    ctx.fillStyle = this.color;
    ctx.fill();

    // eye / core
    ctx.beginPath();
    ctx.arc(0,0, this.size*0.22, 0, Math.PI*2);
    ctx.fillStyle = '#2b2b2b';
    ctx.fill();

    ctx.restore();
  }
}

class Particle {
  constructor(x,y,vx,vy,life,size) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; this.size=size;
  }
  update(dt) {
    this.x += this.vx*dt;
    this.y += this.vy*dt;
    this.vy += 300*dt; // gravity
    this.life -= dt;
  }
  draw(ctx) {
    const alpha = clamp(this.life/1.0, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
    ctx.fillStyle = '#ffd7a6';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ----------------------- Spawners -----------------------
function spawnBullet(opts) {
  state.bullets.push(new Bullet(opts.x, opts.y, opts.vx, opts.vy));
}

function spawnEnemyWave() {
  // spawn randomness with probability for a big enemy
  if(Math.random() < 0.15) {
    // big enemy
    const x = rand(60, W-60);
    state.enemies.push(new Enemy(x, -60, 'big'));
  } else {
    // several smalls or single
    const count = Math.random() < 0.6 ? 1 : 2;
    for(let i=0;i<count;i++){
      const x = rand(40, W-40);
      const e = new Enemy(x, -40, 'basic');
      e.angle = rand(0, Math.PI*2);
      state.enemies.push(e);
    }
  }
}

// ----------------------- Collision & Particles -----------------------
function makeExplosion(x,y,power=12) {
  for(let i=0;i<power;i++){
    const a = rand(0, Math.PI*2);
    const s = rand(60, 260);
    const vx = Math.cos(a)*s;
    const vy = Math.sin(a)*s * 0.8;
    state.particles.push(new Particle(x,y,vx,vy, rand(0.5,1.1), rand(2,5)));
  }
}

// ----------------------- Player + Input -----------------------
const player = new Player();

const input = {
  left:false, right:false, up:false, down:false, shoot:false,
  dx:0, dy:0
};

function updateInputFromKeys() {
  input.dx = (input.right?1:0) - (input.left?1:0);
  input.dy = (input.down?1:0) - (input.up?1:0);
  // normalize so diag doesn't give faster speed
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

// Touch support: touch to move player; tap with second finger to shoot
let ongoingTouches = [];
canvas.addEventListener('touchstart', (ev)=>{
  ev.preventDefault();
  const t = ev.changedTouches[0];
  const pos = getCanvasPos(t);
  // single-finger: move target (relative)
  input.touchTarget = pos;
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

// if touch target exists, move toward it
function applyTouchMovement(dt) {
  if(!input.touchTarget) return;
  const tx = input.touchTarget.x, ty = input.touchTarget.y;
  const vx = tx - player.x, vy = ty - player.y;
  const d = Math.hypot(vx, vy);
  if(d > 6){
    player.x += (vx/d) * player.speed * dt * 0.9;
    player.y += (vy/d) * player.speed * dt * 0.9;
  }
}

// ----------------------- Game Loop -----------------------
function updateScore() {
  scoreEl.textContent = 'Score: ' + Math.floor(state.score);
}

function gameOver() {
  state.running = false;
  player.alive = false;
  overlayText.textContent = `Game Over — Score: ${Math.floor(state.score)}`;
  overlay.classList.remove('hidden');
}

function update(dt) {
  if(!state.running) return;

  // spawn logic
  state.spawnTimer += dt * 1000;
  const interval = Math.max(400, state.spawnInterval - state.score * 0.6); // ramp difficulty gently
  if(state.spawnTimer > interval) {
    state.spawnTimer = 0;
    spawnEnemyWave();
  }

  // input -> player
  if(input.touchTarget) applyTouchMovement(dt);
  else {
    updateInputFromKeys();
    player.update(dt, input);
  }
  // if touch movement handled player, still allow shooting from input.shoot
  if(!input.touchTarget) player.update(dt, input);

  // bullets
  for(let i=state.bullets.length-1;i>=0;i--){
    const b = state.bullets[i];
    b.update(dt);
    if(b.life <= 0 || b.y < -50 || b.y > H + 50 || b.x < -50 || b.x > W + 50) {
      state.bullets.splice(i,1);
    }
  }

  // enemies
  for(let i=state.enemies.length-1;i>=0;i--){
    const e = state.enemies[i];
    e.update(dt);

    // enemy out of screen -> remove
    if(e.y > H + 80) { state.enemies.splice(i,1); continue; }

    // collision: enemy <-> bullets
    for(let j=state.bullets.length-1;j>=0;j--){
      const b = state.bullets[j];
      const r = (e.size*0.5 + b.size*0.5);
      if(dist2(e,b) <= r*r){
        // hit
        e.hp -= 1;
        state.bullets.splice(j,1);
        makeExplosion(b.x, b.y, 6);
        if(e.hp <= 0){
          state.score += e.scoreVal;
          updateScore();
          makeExplosion(e.x, e.y, e.size/2);
          state.enemies.splice(i,1);
        }
        break;
      }
    }

    // collision: enemy <-> player
    if(player.alive){
      const r = (e.size*0.5 + player.size*0.5);
      if(dist2(e, player) <= r*r){
        // damage + game over
        makeExplosion(player.x, player.y, 22);
        makeExplosion(e.x, e.y, 10);
        gameOver();
      }
    }
  }

  // particles
  for(let i=state.particles.length-1;i>=0;i--){
    const p = state.particles[i];
    p.update(dt);
    if(p.life <= 0) state.particles.splice(i,1);
  }
}

function drawBG(ctx){
  // starfield
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0,0,W,H);

  // grid-ish moving parallax lines
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#ffffff';
  for(let x=0;x<W;x+=60){
    ctx.fillRect(x, (Date.now()/30)%40 - 40, 2, H+80);
  }
  ctx.restore();
}

function draw() {
  // clear
  drawBG(ctx);

  // draw player
  player.draw(ctx);

  // draw enemies
  for(const e of state.enemies) e.draw(ctx);

  // draw bullets
  for(const b of state.bullets) b.draw(ctx);

  // draw particles
  for(const p of state.particles) p.draw(ctx);

  // HUD small crosshair under player (for feel)
  ctx.beginPath();
  ctx.arc(player.x, player.y, 2.5, 0, Math.PI*2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function loop(ts) {
  if(!state.lastTime) state.lastTime = ts;
  const dt = Math.min(0.05, (ts - state.lastTime) / 1000); // cap dt
  state.lastTime = ts;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// ----------------------- Controls: Start / Restart -----------------------
startBtn.addEventListener('click', ()=>{
  overlay.classList.add('hidden');
  resetState();
  player.x = W/2; player.y = H - 80; player.alive = true;
  state.running = true;
  state.lastTime = 0;
  requestAnimationFrame(loop);
});

restartBtn.addEventListener('click', ()=>{
  overlay.classList.add('hidden');
  resetState();
  player.x = W/2; player.y = H - 80; player.alive = true;
  state.running = true;
  state.lastTime = 0;
  requestAnimationFrame(loop);
});

// allow starting with Enter key
window.addEventListener('keydown', e => {
  if(e.key === 'Enter' && !state.running){
    startBtn.click();
  }
});

// Kick off initial draw
resetState();
draw();
