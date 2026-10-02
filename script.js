// ===== Snake 3D — Three.js দিয়ে =====
(function() {
  'use strict';

  function $(id) { return document.getElementById(id); }

  const canvas = $('game');
  if (!canvas || typeof THREE === 'undefined') {
    console.error('❌ Three.js বা canvas পাওয়া যায়নি');
    alert('Three.js লোড হয়নি। ইন্টারনেট চেক করে আবার চেষ্টা করুন।');
    return;
  }

  const menuScreen = $('menuScreen');
  const customScreen = $('customScreen');
  const gameScreen = $('gameScreen');
  const scoreEl = $('score');
  const hiscoreEl = $('hiscore');
  const statusText = $('statusText');

  // ===== গ্রিড সেটিংস =====
  const GRID = 15;          // 15x15 গ্রিড
  const CELL = 1;           // প্রতি ঘর 1 ইউনিট
  const OFFSET = (GRID - 1) / 2;

  // ===== থিম =====
  const THEMES = {
    nokia:  { bg:0x0f380f, floor:0x1a4a1a, grid:0x2a6a2a, fog:0x0f380f },
    dark:   { bg:0x0a0a0a, floor:0x1a1a1a, grid:0x333333, fog:0x000000 },
    ocean:  { bg:0x0a1a3a, floor:0x1a3a5a, grid:0x2a5a8a, fog:0x0a1a3a },
    sunset: { bg:0x2a0a1a, floor:0x4a1a2a, grid:0x8a3a4a, fog:0x2a0a1a },
    forest: { bg:0x0a1a0a, floor:0x1a3a1a, grid:0x2a5a2a, fog:0x0a1a0a },
    purple: { bg:0x1a0a2a, floor:0x2a1a4a, grid:0x4a2a7a, fog:0x1a0a2a }
  };

  // ===== সাপের রঙ =====
  const SNAKE_COLORS = [
    { head:0x2aff2a, body:0x0f880f, name:'Classic' },
    { head:0xffffff, body:0x666666, name:'White'   },
    { head:0xff3333, body:0x8b0000, name:'Red'     },
    { head:0x00d4ff, body:0x0066cc, name:'Blue'    },
    { head:0xffaa00, body:0xcc6600, name:'Orange'  },
    { head:0xff44aa, body:0xcc2266, name:'Pink'    },
    { head:0xaa44ff, body:0x6622cc, name:'Purple'  },
    { head:0xffdd00, body:0xaa8800, name:'Gold'    }
  ];

  // ===== খাবারের রঙ =====
  const FOOD_COLORS = [0xff2222, 0xffdd00, 0xff44aa, 0x22ddff, 0xffffff, 0xffaa00];

  // ===== Difficulty =====
  const DIFFICULTIES = {
    easy:     { speed: 350, name:'Easy' },
    hard:     { speed: 220, name:'Hard' },
    veryhard: { speed: 130, name:'Very Hard' }
  };

  // ===== State =====
  let config = {
    theme: 'nokia',
    snakeColor: 0,
    foodColor: 0,
    difficulty: 'easy'
  };

  let scene, camera, renderer;
  let snakeMeshes = [];
  let foodMesh = null;
  let floorMesh = null;

  let snake = [];
  let dir = {x: 1, z: 0};
  let nextDir = {x: 1, z: 0};
  let food = {x: 5, z: 5};
  let score = 0;
  let alive = true;
  let paused = false;
  let started = false;
  let tickInterval = 350;
  let lastTick = 0;
  let animationId = null;
  let statusTimeout = null;
  let clock = null;

  // ===== সাউন্ড =====
  let audioCtx = null;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch(e) {}

  function playSound(freq, duration, type, volume) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume || 0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
  }

  function eatSound() {
    playSound(880, 0.08, 'square', 0.06);
    setTimeout(() => playSound(1320, 0.1, 'square', 0.06), 70);
  }

  function gameOverSound() {
    playSound(400, 0.15, 'sawtooth', 0.08);
    setTimeout(() => playSound(300, 0.15, 'sawtooth', 0.08), 130);
    setTimeout(() => playSound(200, 0.3, 'sawtooth', 0.08), 260);
  }

  function clickSound() { playSound(600, 0.05, 'square', 0.04); }

  // ===== localStorage =====
  function loadConfig() {
    try {
      const saved = localStorage.getItem('snake3dConfig');
      if (saved) config = Object.assign({}, config, JSON.parse(saved));
    } catch(e) {}
  }
  function saveConfig() {
    try { localStorage.setItem('snake3dConfig', JSON.stringify(config)); } catch(e) {}
  }
  function getHiScore() {
    try { return parseInt(localStorage.getItem('snake3dHi_' + config.difficulty) || '0'); }
    catch(e) { return 0; }
  }
  function setHiScore(v) {
    try { localStorage.setItem('snake3dHi_' + config.difficulty, v); } catch(e) {}
  }

  // ===== 3D দৃশ্য তৈরি =====
  function initThree() {
    // Scene
    scene = new THREE.Scene();

    // Camera (উপর-পিছন থেকে তাকিয়ে)
    const aspect = canvas.clientWidth / canvas.clientHeight || 1;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.set(0, GRID * 1.4, GRID * 1.1);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false
    });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // আলো
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 15, 8);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x9bbc0f, 0.5, 30);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);

    // Clock
    clock = new THREE.Clock();

    // Responsive
    window.addEventListener('resize', onResize);
    onResize();
  }

  function onResize() {
    if (!renderer || !camera) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ===== থিম আপডেট =====
  function applyTheme() {
    const th = THEMES[config.theme] || THEMES.nokia;

    scene.background = new THREE.Color(th.bg);
    scene.fog = new THREE.Fog(th.fog, GRID * 0.8, GRID * 2.2);

    // Floor মুছে নতুন বানাও
    if (floorMesh) {
      scene.remove(floorMesh);
      floorMesh.geometry.dispose();
      floorMesh.material.dispose();
    }

    // গ্রিড floor
    const floorGeo = new THREE.PlaneGeometry(GRID, GRID);
    const floorMat = new THREE.MeshStandardMaterial({
      color: th.floor,
      roughness: 0.85,
      metalness: 0.15
    });
    floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.5;
    scene.add(floorMesh);

    // গ্রিড লাইন
    const gridHelper = new THREE.GridHelper(GRID, GRID, th.grid, th.grid);
    gridHelper.position.y = -0.49;
    scene.add(gridHelper);

    // বর্ডার
    const borderGeo = new THREE.BoxGeometry(GRID + 0.3, 0.3, GRID + 0.3);
    const borderMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.6,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85
    });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.y = -0.5;
    // বর্ডার লাইন (কিন্তু ভিতরে ফাঁকা) — wireframe দিয়ে
    const edges = new THREE.EdgesGeometry(borderGeo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: 0x9bbc0f, linewidth: 2
    }));
    line.position.y = -0.5;
    scene.add(line);
  }

  // ===== গ্রিড → 3D position =====
  function gridToPos(gx, gz) {
    return {
      x: (gx - OFFSET) * CELL,
      z: (gz - OFFSET) * CELL
    };
  }

  // ===== সাপের মেশ তৈরি =====
  function createSnakeMeshes(count) {
    // পুরনো মেশ মুছো
    snakeMeshes.forEach(m => {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    snakeMeshes = [];

    const colors = SNAKE_COLORS[config.snakeColor] || SNAKE_COLORS[0];

    for (let i = 0; i < count; i++) {
      const size = 0.85;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: i === 0 ? colors.head : colors.body,
        roughness: 0.35,
        metalness: 0.4,
        emissive: i === 0 ? colors.head : 0x000000,
        emissiveIntensity: i === 0 ? 0.4 : 0
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      snakeMeshes.push(mesh);
    }
  }

  // ===== খাবার মেশ =====
  function createFoodMesh() {
    if (foodMesh) {
      scene.remove(foodMesh);
      foodMesh.geometry.dispose();
      foodMesh.material.dispose();
    }
    const geo = new THREE.SphereGeometry(0.45, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: FOOD_COLORS[config.foodColor] || FOOD_COLORS[0],
      roughness: 0.25,
      metalness: 0.5,
      emissive: FOOD_COLORS[config.foodColor] || FOOD_COLORS[0],
      emissiveIntensity: 0.5
    });
    foodMesh = new THREE.Mesh(geo, mat);
    scene.add(foodMesh);
  }

  // ===== সাপ ও খাবার পজিশন আপডেট =====
  function updateMeshes() {
    // সাপ
    if (snakeMeshes.length < snake.length) {
      createSnakeMeshes(snake.length);
    }
    snake.forEach((seg, i) => {
      const mesh = snakeMeshes[i];
      if (!mesh) return;
      const pos = gridToPos(seg.x, seg.z);
      mesh.position.set(pos.x, 0, pos.z);
      mesh.visible = true;
    });
    // বাকি মেশ লুকাও
    for (let i = snake.length; i < snakeMeshes.length; i++) {
      snakeMeshes[i].visible = false;
    }

    // খাবার
    if (foodMesh) {
      const pos = gridToPos(food.x, food.z);
      foodMesh.position.set(pos.x, 0, pos.z);
    }
  }

  // ===== গেম লজিক =====
  function resetGame() {
    snake = [
      {x: 7, z: 7},
      {x: 6, z: 7},
      {x: 5, z: 7}
    ];
    dir = {x: 1, z: 0};
    nextDir = {x: 1, z: 0};
    score = 0;
    alive = true;
    paused = false;
    placeFood();
    updateScore();
    if (hiscoreEl) hiscoreEl.textContent = String(getHiScore()).padStart(3,'0');

    // মেশ রিসেট
    if (scene) {
      createSnakeMeshes(snake.length);
      createFoodMesh();
      updateMeshes();
    }
  }

  function placeFood() {
    let attempts = 0;
    while (attempts < 200) {
      const f = {
        x: Math.floor(Math.random() * GRID),
        z: Math.floor(Math.random() * GRID)
      };
      if (!snake.some(s => s.x === f.x && s.z === f.z)) {
        food = f;
        return;
      }
      attempts++;
    }
  }

  function updateScore() {
    if (scoreEl) scoreEl.textContent = String(score).padStart(3,'0');
  }

  function showStatus(text, isGreen) {
    if (!statusText) return;
    statusText.textContent = text;
    statusText.className = 'status-text' + (isGreen ? ' playing' : '');
    statusText.classList.remove('hidden');
    if (statusTimeout) clearTimeout(statusTimeout);
  }

  function hideStatusLater(ms) {
    if (statusTimeout) clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      if (statusText) statusText.classList.add('hidden');
    }, ms);
  }

  function tick() {
    if (!alive || paused) return;
    dir = nextDir;

    const head = {
      x: snake[0].x + dir.x,
      z: snake[0].z + dir.z
    };

    // দেয়ালে ধাক্কা
    if (head.x < 0 || head.x >= GRID || head.z < 0 || head.z >= GRID) {
      return gameOver();
    }
    // নিজের গায়ে ধাক্কা
    if (snake.some(s => s.x === head.x && s.z === head.z)) {
      return gameOver();
    }

    snake.unshift(head);

    if (head.x === food.x && head.z === food.z) {
      score += 1;
      updateScore();
      eatSound();
      placeFood();
      // নতুন খাবার মেশে পজিশন আপডেট
      if (foodMesh) {
        const pos = gridToPos(food.x, food.z);
        foodMesh.position.set(pos.x, 0, pos.z);
      }
    } else {
      snake.pop();
    }

    updateMeshes();
  }

  function gameOver() {
    alive = false;
    gameOverSound();
    if (score > getHiScore()) setHiScore(score);
    if (hiscoreEl) hiscoreEl.textContent = String(getHiScore()).padStart(3,'0');
    showStatus('GAME OVER', false);
  }

  function togglePause() {
    if (!started || !alive) return;
    paused = !paused;
    clickSound();
    if (paused) {
      showStatus('GAME PAUSED', false);
    } else {
      showStatus('PLAYING', true);
      hideStatusLater(1200);
      lastTick = performance.now();
    }
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    if (started && alive && !paused) {
      const ts = performance.now();
      if (ts - lastTick >= tickInterval) {
        tick();
        lastTick = ts;
      }
    }

    // খাবার ঘোরাও (দৃশ্যমান প্রভাব)
    if (foodMesh) {
      foodMesh.rotation.y += 0.03;
      foodMesh.rotation.x += 0.015;
      const s = 1 + Math.sin(performance.now() * 0.005) * 0.08;
      foodMesh.scale.set(s, s, s);
    }

    // সাপের মাথা হালকা বাউন্স
    if (snakeMeshes[0] && snakeMeshes[0].visible) {
      snakeMeshes[0].position.y = Math.sin(performance.now() * 0.008) * 0.05;
    }

    renderer.render(scene, camera);
  }

  function startGame() {
    // প্রথমবার থ্রি সিন বানাতে হবে?
    if (!scene) {
      initThree();
      applyTheme();
    } else {
      applyTheme();
    }
    resetGame();
    started = true;
    paused = false;
    tickInterval = DIFFICULTIES[config.difficulty] ?
      DIFFICULTIES[config.difficulty].speed : 350;
    lastTick = performance.now();

    showStatus('GAME STARTING...', true);
    hideStatusLater(1200);

    // অ্যানিমেশন লুপ চালু
    if (!animationId) {
      animate();
    }
  }

  // ===== কাস্টমাইজ UI =====
  function buildCustomUI() {
    const themeRow = $('themeRow');
    if (themeRow) {
      themeRow.innerHTML = '';
      Object.keys(THEMES).forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'chip' + (config.theme === key ? ' active' : '');
        btn.textContent = key.toUpperCase();
        btn.onclick = () => {
          config.theme = key;
          saveConfig();
          buildCustomUI();
          clickSound();
          if (scene) applyTheme();
        };
        themeRow.appendChild(btn);
      });
    }

    const scRow = $('snakeColorRow');
    if (scRow) {
      scRow.innerHTML = '';
      SNAKE_COLORS.forEach((c, i) => {
        const sw = document.createElement('div');
        sw.className = 'swatch' + (config.snakeColor === i ? ' active' : '');
        // hex int → css
        const headCss = '#' + c.head.toString(16).padStart(6, '0');
        const bodyCss = '#' + c.body.toString(16).padStart(6, '0');
        sw.style.background = 'linear-gradient(135deg, ' + headCss + ', ' + bodyCss + ')';
        sw.title = c.name;
        sw.onclick = () => {
          config.snakeColor = i;
          saveConfig();
          buildCustomUI();
          clickSound();
          if (scene) {
            createSnakeMeshes(snake.length);
            updateMeshes();
          }
        };
        scRow.appendChild(sw);
      });
    }

    const fcRow = $('foodColorRow');
    if (fcRow) {
      fcRow.innerHTML = '';
      FOOD_COLORS.forEach((c, i) => {
        const sw = document.createElement('div');
        sw.className = 'swatch' + (config.foodColor === i ? ' active' : '');
        sw.style.background = '#' + c.toString(16).padStart(6, '0');
        sw.onclick = () => {
          config.foodColor = i;
          saveConfig();
          buildCustomUI();
          clickSound();
          if (scene) createFoodMesh();
        };
        fcRow.appendChild(sw);
      });
    }

    const dRow = $('diffRow');
    if (dRow) {
      dRow.innerHTML = '';
      Object.keys(DIFFICULTIES).forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'chip' + (config.difficulty === key ? ' active' : '');
        btn.textContent = DIFFICULTIES[key].name;
        btn.onclick = () => {
          config.difficulty = key;
          saveConfig();
          buildCustomUI();
          clickSound();
          // Hi-score রিফ্রেশ
          if (hiscoreEl) hiscoreEl.textContent = String(getHiScore()).padStart(3,'0');
        };
        dRow.appendChild(btn);
      });
    }
  }

  // ===== স্ক্রিন নেভিগেশন =====
  function showScreen(name) {
    if (menuScreen) menuScreen.classList.add('hidden');
    if (customScreen) customScreen.classList.add('hidden');
    if (gameScreen) gameScreen.classList.add('hidden');

    if (name === 'menu' && menuScreen) menuScreen.classList.remove('hidden');
    if (name === 'custom' && customScreen) customScreen.classList.remove('hidden');
    if (name === 'game' && gameScreen) gameScreen.classList.remove('hidden');

    // Canvas রিসাইজ
    setTimeout(onResize, 50);
  }

  // ===== বাটন হ্যান্ডলার =====
  const playBtn = $('playBtn');
  if (playBtn) playBtn.onclick = () => {
    clickSound();
    showScreen('game');
    startGame();
  };

  const customBtn = $('customBtn');
  if (customBtn) customBtn.onclick = () => {
    clickSound();
    buildCustomUI();
    showScreen('custom');
  };

  const howBtn = $('howBtn');
  if (howBtn) howBtn.onclick = () => {
    clickSound();
    alert(
      "🎮 Snake 3D — কিভাবে খেলবেন:\n\n" +
      "• Arrow Keys / WASD দিয়ে সাপ চালান\n" +
      "• মোবাইলে D-Pad বা Swipe ব্যবহার করুন\n" +
      "• ● (মাঝ বাটন) = Pause / Resume\n" +
      "• Game Over হলে ● চাপলে নতুন গেম\n" +
      "• প্রতিটি খাবারে +১ পয়েন্ট\n" +
      "• দেয়াল বা নিজের গায়ে ধাক্কা = Game Over"
    );
  };

  const customPlayBtn = $('customPlayBtn');
  if (customPlayBtn) customPlayBtn.onclick = () => {
    clickSound();
    showScreen('game');
    startGame();
  };

  const gameSettingsBtn = $('gameSettingsBtn');
  if (gameSettingsBtn) gameSettingsBtn.onclick = () => {
    clickSound();
    if (started && alive) {
      paused = true;
      showStatus('GAME PAUSED', false);
    }
    buildCustomUI();
    showScreen('custom');
  };

  const pauseCenter = $('pauseCenter');
  if (pauseCenter) {
    pauseCenter.addEventListener('click', () => {
      if (started && !alive) { startGame(); return; }
      if (started && alive) { togglePause(); return; }
      if (!started) startGame();
    });
  }

  // ===== কন্ট্রোল =====
  function setDirection(d) {
    const dirs = {
      up:    {x: 0, z: -1},
      down:  {x: 0, z: 1},
      left:  {x: -1, z: 0},
      right: {x: 1, z: 0}
    };
    const nd = dirs[d];
    if (!nd) return;
    // উল্টো দিকে ঘুরতে দেব না
    if (nd.x === -dir.x && nd.z === -dir.z) return;
    nextDir = nd;
  }

  document.addEventListener('keydown', e => {
    const map = {
      ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
      w:'up', s:'down', a:'left', d:'right',
      W:'up', S:'down', A:'left', D:'right'
    };
    if (map[e.key]) {
      e.preventDefault();
      setDirection(map[e.key]);
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (started && !alive) startGame();
      else if (started && alive) togglePause();
      else startGame();
    }
  });

  document.querySelectorAll('.dpad[data-dir]').forEach(btn => {
    const fire = e => {
      if (e) e.preventDefault();
      setDirection(btn.dataset.dir);
    };
    btn.addEventListener('touchstart', fire, {passive: false});
    btn.addEventListener('mousedown', fire);
  });

  // Canvas swipe / tap
  let ts = null;
  canvas.addEventListener('touchstart', e => {
    ts = {x: e.touches[0].clientX, y: e.touches[0].clientY};
  }, {passive: true});

  canvas.addEventListener('touchend', e => {
    if (!ts) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - ts.x;
    const dy = t.clientY - ts.y;

    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      if (started && !alive) startGame();
      ts = null;
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      setDirection(dx > 0 ? 'right' : 'left');
    } else {
      setDirection(dy > 0 ? 'down' : 'up');
    }
    ts = null;
  }, {passive: true});

  canvas.addEventListener('click', () => {
    if (started && !alive) startGame();
  });

  // ===== PWA Install =====
  let deferredPrompt = null;
  const installBtn = $('installBtn');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.classList.remove('hidden');
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        alert(
          "📲 ইনস্টল করার নিয়ম:\n\n" +
          "• Android Chrome: মেনু (⋮) → 'Install app'\n" +
          "• iPhone Safari: Share (□↑) → 'Add to Home Screen'"
        );
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.classList.add('hidden');
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.classList.add('hidden');
    playSound(1000, 0.1, 'square', 0.05);
    setTimeout(() => playSound(1500, 0.15, 'square', 0.05), 100);
  });

  try {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      if (installBtn) installBtn.classList.add('hidden');
    }
  } catch(e) {}

  // ===== ইনিশিয়ালাইজ =====
  loadConfig();
  showScreen('menu');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

})();
