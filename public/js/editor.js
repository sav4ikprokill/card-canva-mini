const canvas = document.getElementById("card-canvas");
const ctx = canvas.getContext("2d");

const logicalWidth = 800;
const logicalHeight = 500;

let bgColor = "#ffffff";
let objects = [];
let selectedId = null;
let isDragging = false;
let dragOffsetX = 0, dragOffsetY = 0;

let undoStack = [];
let redoStack = [];

let currentUser = null;
let userCards = [];
let autoSaveTimer = null;
let isAutoSaving = false;

function setupHiDPICanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = logicalWidth * ratio;
  canvas.height = logicalHeight * ratio;
  canvas.style.width = logicalWidth + "px";
  canvas.style.height = logicalHeight + "px";
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

setupHiDPICanvas();

function pushHistory() {
  undoStack.push(JSON.stringify({ bgColor, objects }));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
}

function restoreFrom(snapshot) {
  const state = JSON.parse(snapshot);
  bgColor = state.bgColor;
  objects = state.objects;
  selectedId = null;
  redraw();
  syncSelectionUI();
}

function updateUndoRedoButtons() {
  document.getElementById("btn-undo").disabled = undoStack.length === 0;
  document.getElementById("btn-redo").disabled = redoStack.length === 0;
}

function redraw() {
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);
  
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  
  for (const obj of objects) {
    drawObject(obj);
  }
  
  const sel = objects.find(o => o.id === selectedId);
  if (sel) {
    ctx.save();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2 / (window.devicePixelRatio || 1);
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(sel.x, sel.y, sel.width, sel.height);
    ctx.restore();
  }

  if (currentUser && !isAutoSaving) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      try {
        isAutoSaving = true;
        await saveCurrentCard(true);
        console.log('🔄 Автосохранено');
      } catch (err) {
        console.error('Автосохранение:', err);
      } finally {
        isAutoSaving = false;
      }
    }, 2000);
  }
}

function drawObject(obj) {
  ctx.save();
  
  if (obj.type === "text") {
    ctx.font = `${obj.fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillStyle = obj.color;
    wrapText(obj.text, obj.x, obj.y, obj.width, obj.fontSize * 1.2);
  } else if (obj.type === "shape") {
    ctx.fillStyle = obj.color;
    if (obj.shape === "rect") ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
    else if (obj.shape === "circle") {
      const r = Math.min(obj.width, obj.height) / 2;
      ctx.beginPath();
      ctx.arc(obj.x + r, obj.y + r, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (obj.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(obj.x + obj.width/2, obj.y);
      ctx.lineTo(obj.x + obj.width, obj.y + obj.height);
      ctx.lineTo(obj.x, obj.y + obj.height);
      ctx.fill();
    }
  } else if (obj.type === "sticker") {
    ctx.font = `${obj.fontSize}px "Segoe UI Emoji", sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(obj.emoji, obj.x, obj.y);
  }
  
  ctx.restore();
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yPos = y;
  
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, yPos);
      line = words[n] + ' ';
      yPos += lineHeight;
    } else line = testLine;
  }
  ctx.fillText(line, x, yPos);
}

function createId() {
  return Math.random().toString(36).substr(2, 9);
}

function hitTest(mx, my) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (mx >= o.x && mx <= o.x + o.width && my >= o.y && my <= o.y + o.height) return o;
  }
  return null;
}

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (logicalWidth / rect.width);
  const my = (e.clientY - rect.top) * (logicalHeight / rect.height);
  
  const hit = hitTest(mx, my);
  if (hit) {
    selectedId = hit.id;
    dragOffsetX = mx - hit.x;
    dragOffsetY = my - hit.y;
    isDragging = true;
  } else selectedId = null;
  
  syncSelectionUI();
  redraw();
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (logicalWidth / rect.width);
  const my = (e.clientY - rect.top) * (logicalHeight / rect.height);
  
  const obj = objects.find(o => o.id === selectedId);
  if (obj) {
    obj.x = mx - dragOffsetX;
    obj.y = my - dragOffsetY;
    redraw();
  }
});

canvas.addEventListener("mouseup", () => {
  if (isDragging) pushHistory();
  isDragging = false;
});

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const mx = (touch.clientX - rect.left) * (logicalWidth / rect.width);
  const my = (touch.clientY - rect.top) * (logicalHeight / rect.height);
  const hit = hitTest(mx, my);
  if (hit) {
    selectedId = hit.id;
    dragOffsetX = mx - hit.x;
    dragOffsetY = my - hit.y;
    isDragging = true;
  } else selectedId = null;
  syncSelectionUI();
  redraw();
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  if (!isDragging) return;
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const mx = (touch.clientX - rect.left) * (logicalWidth / rect.width);
  const my = (touch.clientY - rect.top) * (logicalHeight / rect.height);
  const obj = objects.find(o => o.id === selectedId);
  if (obj) {
    obj.x = mx - dragOffsetX;
    obj.y = my - dragOffsetY;
    redraw();
  }
}, { passive: false });

canvas.addEventListener("touchend", () => {
  if (isDragging) pushHistory();
  isDragging = false;
});

const MOVE_STEP = 3;
window.addEventListener("keydown", (e) => {
  const obj = objects.find(o => o.id === selectedId);
  if (!obj) return;
  let moved = false;
  if (e.key === "ArrowUp") { obj.y -= MOVE_STEP; moved = true; }
  if (e.key === "ArrowDown") { obj.y += MOVE_STEP; moved = true; }
  if (e.key === "ArrowLeft") { obj.x -= MOVE_STEP; moved = true; }
  if (e.key === "ArrowRight") { obj.x += MOVE_STEP; moved = true; }
  if (e.key === "Delete" || e.key === "Backspace") {
    pushHistory();
    objects = objects.filter(o => o.id !== selectedId);
    selectedId = null;
    syncSelectionUI();
    redraw();
    return;
  }
  if (moved) {
    e.preventDefault();
    redraw();
  }
});

window.addEventListener("keyup", (e) => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) pushHistory();
});

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// Templates data
const templates = [
  {
    id: 'birthday',
    name: '🎂 День рождения',
    description: 'Торт, конфетти, пожелания',
    bgColor: '#fef3c7',
    objects: [
      { type: 'text', text: 'С днём рождения!', fontSize: 44, color: '#0f172a', x: 80, y: 80, width: 640, height: 132 },
      { type: 'text', text: 'Желаю счастья и исполнения желаний!', fontSize: 24, color: '#374151', x: 100, y: 160, width: 600, height: 72 },
      { type: 'sticker', emoji: '🎂', fontSize: 90, x: 120, y: 300, width: 90, height: 90 },
      { type: 'sticker', emoji: '🎉', fontSize: 80, x: 500, y: 320, width: 80, height: 80 }
    ]
  },
  {
    id: 'march8',
    name: '🌸 8 марта',
    description: 'Розовый фон, цветы',
    bgColor: '#fdf2f8',
    objects: [
      { type: 'text', text: 'С 8 марта!', fontSize: 48, color: '#be185d', x: 60, y: 100, width: 680, height: 144 },
      { type: 'text', text: 'Будь самой счастливой!', fontSize: 26, color: '#7c2d12', x: 90, y: 180, width: 620, height: 78 },
      { type: 'sticker', emoji: '💐', fontSize: 100, x: 250, y: 320, width: 100, height: 100 }
    ]
  },
  {
    id: 'newyear',
    name: '🎄 Новый год',
    description: 'Тёмный фон, ёлка, звёзды',
    bgColor: '#020617',
    objects: [
      { type: 'text', text: 'С Новым годом!', fontSize: 44, color: '#e5e7eb', x: 100, y: 90, width: 600, height: 132 },
      { type: 'text', text: 'Счастья, удачи и новых вершин!', fontSize: 24, color: '#94a3b8', x: 120, y: 170, width: 560, height: 72 },
      { type: 'sticker', emoji: '🎄', fontSize: 110, x: 150, y: 320, width: 110, height: 110 },
      { type: 'sticker', emoji: '✨', fontSize: 70, x: 550, y: 350, width: 70, height: 70 }
    ]
  },
  {
    id: 'wedding',
    name: '💍 Свадьба',
    description: 'Нежные пастельные тона',
    bgColor: '#fff0f6',
    objects: [
      { type: 'text', text: 'Поздравляем с днем свадьбы!', fontSize: 38, color: '#831843', x: 100, y: 70, width: 600, height: 114 },
      { type: 'sticker', emoji: '💍', fontSize: 100, x: 380, y: 220, width: 100, height: 100 }
    ]
  },
  {
    id: 'valentines',
    name: '❤️ День святого Валентина',
    description: 'Красный и розовый, сердца',
    bgColor: '#ffdde1',
    objects: [
      { type: 'text', text: 'С Днём всех влюблённых!', fontSize: 46, color: '#b0003a', x: 80, y: 90, width: 640, height: 138 },
      { type: 'sticker', emoji: '❤️', fontSize: 110, x: 350, y: 250, width: 110, height: 110 }
    ]
  },
  {
    id: 'newbaby',
    name: '🍼 Новорожденный',
    description: 'Голубой и розовый',
    bgColor: '#cde9ff',
    objects: [
      { type: 'text', text: 'Добро пожаловать, малыш!', fontSize: 40, color: '#002d62', x: 70, y: 80, width: 660, height: 120 },
      { type: 'sticker', emoji: '🍼', fontSize: 90, x: 300, y: 260, width: 90, height: 90 }
    ]
  },
  {
    id: 'thankyou',
    name: '🙏 Спасибо',
    description: 'Лёгкий и светлый',
    bgColor: '#dbeafe',
    objects: [
      { type: 'text', text: 'Спасибо!', fontSize: 48, color: '#1e40af', x: 150, y: 100, width: 500, height: 144 }
    ]
  },
  {
    id: 'corporate',
    name: '💼 Корпоративная',
    description: 'Стильная синий и серый',
    bgColor: '#f9fafb',
    objects: [
      { type: 'text', text: 'Спасибо за сотрудничество!', fontSize: 36, color: '#0f172a', x: 120, y: 120, width: 560, height: 108 }
    ]
  }
];

function renderTemplatesGrid() {
  const container = document.getElementById('templates-grid');
  container.innerHTML = '';
  templates.forEach(template => {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.title = template.description;
    const title = document.createElement('div');
    title.className = 'template-card-title';
    title.textContent = template.name;
    const desc = document.createElement('div');
    desc.className = 'template-card-desc';
    desc.textContent = template.description;
    const preview = document.createElement('div');
    preview.className = 'template-card-preview';
    const miniCanvas = document.createElement('canvas');
    miniCanvas.width = 160;
    miniCanvas.height = 100;
    miniCanvas.style.borderRadius = '0.6rem';
    preview.appendChild(miniCanvas);
    drawTemplatePreview(miniCanvas, template);
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(preview);
    card.addEventListener('click', () => applyTemplate(template));
    container.appendChild(card);
  });
}

function drawTemplatePreview(canvas, template) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = template.bgColor || '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const obj of template.objects) {
    ctx.save();
    if (obj.type === 'text') {
      ctx.fillStyle = obj.color || '#000';
      ctx.font = `${(obj.fontSize*canvas.height/logicalHeight).toFixed(0)}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(obj.text, obj.x*canvas.width/logicalWidth, obj.y*canvas.height/logicalHeight);
    } else if (obj.type === 'sticker') {
      ctx.font = `${(obj.fontSize*canvas.height/logicalHeight).toFixed(0)}px "Segoe UI Emoji", sans-serif`;
      ctx.fillText(obj.emoji, obj.x*canvas.width/logicalWidth, obj.y*canvas.height/logicalHeight);
    }
    ctx.restore();
  }
}

function applyTemplate(template) {
  pushHistory();
  bgColor = template.bgColor || '#ffffff';
  objects = template.objects.map(obj => ({...obj, id: createId()}));
  selectedId = null;
  redraw();
  syncSelectionUI();
  document.querySelector('.tab-btn[data-tab="text"]').click();
}

document.getElementById("btn-add-text").onclick = () => {
  const text = document.getElementById("text-input").value || "Текст";
  const fontSize = +document.getElementById("text-size").value || 32;
  const color = document.getElementById("text-color").value;
  pushHistory();
  const obj = {
    id: createId(),
    type: "text",
    text, fontSize, color,
    x: 100, y: 150,
    width: logicalWidth*0.7,
    height: fontSize*3
  };
  objects.push(obj);
  selectedId = obj.id;
  syncSelectionUI();
  redraw();
};

document.querySelectorAll(".btn-chip[data-shape]").forEach(btn => {
  btn.onclick = () => {
    pushHistory();
    objects.push({
      id: createId(),
      type: "shape",
      shape: btn.dataset.shape,
      color: document.getElementById("shape-color").value,
      x: 150,
      y: 200,
      width: 160,
      height: 120
    });
    selectedId = objects[objects.length - 1].id;
    syncSelectionUI();
    redraw();
  };
});

document.querySelectorAll(".sticker-btn").forEach(btn => {
  btn.onclick = () => {
    pushHistory();
    objects.push({
      id: createId(),
      type: "sticker",
      emoji: btn.textContent,
      fontSize: 72,
      x: 200,
      y: 200,
      width: 72,
      height: 72
    });
    selectedId = objects[objects.length - 1].id;
    syncSelectionUI();
    redraw();
  };
});

document.getElementById("btn-apply-bg").onclick = () => {
  pushHistory();
  bgColor = document.getElementById("bg-color").value;
  redraw();
};

function syncSelectionUI() {
  const obj = objects.find(o => o.id === selectedId);
  document.getElementById("btn-delete").disabled = !obj;
  document.getElementById("selection-info").textContent = obj ?
    `Выбран: ${obj.type === "text" ? "Текст" : obj.type === "shape" ? "Фигура" : "Стикер"}` :
    "Выберите объект на холсте";

  document.querySelectorAll(".prop-group").forEach(g => g.style.display = "none");
  if (!obj) return;

  const group = document.querySelector(`.prop-group[data-type="${obj.type}"]`);
  if (group) group.style.display = "block";

  if (obj.type === "text") {
    document.getElementById("prop-text-content").value = obj.text;
    document.getElementById("prop-text-size").value = obj.fontSize;
    document.getElementById("prop-text-color").value = obj.color;
  } else if (obj.type === "shape") {
    document.getElementById("prop-shape-color").value = obj.color;
  }
}

document.getElementById("prop-text-content").oninput = e => {
  const obj = objects.find(o => o.id === selectedId && o.type === "text");
  if (obj) {
    obj.text = e.target.value;
    redraw();
  }
};

document.getElementById("prop-text-size").oninput = e => {
  const obj = objects.find(o => o.id === selectedId && o.type === "text");
  if (obj) {
    obj.fontSize = +e.target.value;
    obj.height = obj.fontSize * 3;
    redraw();
  }
};

document.getElementById("prop-text-color").oninput =
document.getElementById("prop-shape-color").oninput = e => {
  const obj = objects.find(o => o.id === selectedId);
  if (obj) {
    obj.color = e.target.value;
    redraw();
  }
};

document.getElementById("btn-delete").onclick = () => {
  if (!selectedId) return;
  pushHistory();
  objects = objects.filter(o => o.id !== selectedId);
  selectedId = null;
  syncSelectionUI();
  redraw();
};

document.getElementById("btn-undo").onclick = () => {
  if (undoStack.length) {
    redoStack.push(JSON.stringify({bgColor, objects}));
    restoreFrom(undoStack.pop());
  }
};

document.getElementById("btn-redo").onclick = () => {
  if (redoStack.length) {
    undoStack.push(JSON.stringify({bgColor, objects}));
    restoreFrom(redoStack.pop());
  }
};

document.getElementById("btn-download").onclick = () => {
  const dataURL = canvas.toDataURL("image/png", 1.0);
  const link = document.createElement("a");
  const now = new Date();
  link.download = `открытка_${now.toISOString().slice(0,10)}.png`;
  link.href = dataURL;
  link.click();
};

async function initAuth() {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const response = await fetch('/api/cards', {headers: {Authorization: `Bearer ${token}`}});
      if (response.ok) {
        currentUser = { id: 1, username: 'user' };
        updateSaveButton();
      }
    } catch {
      localStorage.removeItem('token');
    }
  }
}

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!currentUser) {
    alert('Войдите для сохранения');
    window.open('/login.html', '_blank');
    return;
  }
  try {
    await saveCurrentCard();
    alert('✅ Открытка сохранена!');
  } catch (err) {
    alert('Ошибка сохранения: ' + err.message);
  }
});

async function saveCurrentCard(silent = false) {
  const cardData = {bgColor, objects};
  const response = await fetch('/api/cards', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}`},
    body: JSON.stringify({title: `Открытка ${new Date().toLocaleDateString()}`, data: JSON.stringify(cardData)})
  });
  if (!response.ok) throw new Error('Ошибка сохранения');
  if (!silent) {
    const savedCard = await response.json();
    console.log('Saved:', savedCard);
  }
}

document.getElementById('btn-load').addEventListener('click', async () => {
  if (!currentUser) {
    alert('Войдите в аккаунт');
    window.open('/login.html', '_blank');
    return;
  }
  try {
    userCards = await fetch('/api/cards', {headers: {Authorization: `Bearer ${localStorage.getItem('token')}`}}).then(r => r.json());
    if (userCards.length === 0) {
      alert('У вас нет сохранённых открыток');
      return;
    }
    showLoadModal();
  } catch (err) {
    alert('Ошибка загрузки: ' + err.message);
  }
});

function showLoadModal() {
  const modal = document.getElementById('load-modal');
  const list = document.getElementById('load-cards-list');
  list.innerHTML = userCards.map(card => {
    const data = JSON.parse(card.data);
    return `
      <div class="load-card-item" data-card-id="${card.id}">
        <div class="load-card-title">${card.title}</div>
        <div class="load-card-date">${new Date(card.updatedAt).toLocaleString()}</div>
        <div style="background: ${data.bgColor}; width: 40px; height: 25px; border-radius: 4px; margin-top: 0.25rem;"></div>
      </div>`;
  }).join('');
  modal.style.display = 'flex';
  document.querySelectorAll('.load-card-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.load-card-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      window.selectedLoadCardId = item.dataset.cardId;
    });
  });
}

document.getElementById('modal-load-btn').addEventListener('click', async () => {
  if (!window.selectedLoadCardId) {
    alert('Выберите открытку');
    return;
  }
  try {
    const response = await fetch(`/api/cards/${window.selectedLoadCardId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    const card = await response.json();
    const data = JSON.parse(card.data);
    pushHistory();
    bgColor = data.bgColor;
    objects = data.objects;
    selectedId = null;
    redraw();
    syncSelectionUI();
    alert('✅ Открытка загружена!');
    document.getElementById('load-modal').style.display = 'none';
  } catch (err) {
    alert('Ошибка загрузки: ' + err.message);
  }
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('load-modal').style.display = 'none';
});

document.getElementById('load-modal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    document.getElementById('load-modal').style.display = 'none';
  }
});

function updateSaveButton() {
  const btn = document.getElementById('btn-save');
  if (currentUser) {
    btn.style.opacity = '1';
    btn.disabled = false;
  } else {
    btn.style.opacity = '0.5';
    btn.disabled = true;
    btn.title = 'Войдите для сохранения (Ctrl+S)';
  }
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    document.getElementById('btn-save').click();
  }
});

async function init() {
  await initAuth();
  renderTemplatesGrid();
  pushHistory();
  redraw();
  updateUndoRedoButtons();
  updateSaveButton();
  syncSelectionUI();
}

init();
window.addEventListener('resize', setupHiDPICanvas);