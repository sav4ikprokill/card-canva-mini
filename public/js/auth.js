const API_BASE = '/api';

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    },
    ...options
  };
  const response = await fetch(`${API_BASE}${endpoint}`, config);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Ошибка сервера');
  }
  return response.json();
}

// Регистрация
document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    await apiCall('/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    alert('✅ Регистрация успешна! Войдите в аккаунт.');
    window.location.href = '/login.html';
  } catch (err) {
    alert(err.message);
  }
});

// Вход
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const data = await apiCall('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    localStorage.setItem('token', data.token);
    window.location.href = '/profile.html';
  } catch (err) {
    alert(err.message);
  }
});

// Profile
if (window.location.pathname.includes('profile.html')) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
  } else {
    apiCall('/cards').then(cards => {
      document.getElementById('username-display').textContent = 'Пользователь';
      displayCards(cards);
    }).catch(() => {
      localStorage.removeItem('token');
      window.location.href = '/login.html';
    });
  }
}

function displayCards(cards) {
  const container = document.getElementById('cards-list');
  if (cards.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>📭 У вас пока нет открыток</h3>
        <p>Создайте первую открытку в редакторе!</p>
        <a href="/editor" class="btn-primary">Начать создавать</a>
      </div>
    `;
    return;
  }
  container.innerHTML = cards.map(card => {
    const data = JSON.parse(card.data);
    return `
      <div class="card-item">
        <div class="card-preview" style="background: ${data.bgColor || '#fff'}"></div>
        <div class="card-item-content">
          <h3 class="card-title">${card.title}</h3>
          <p class="card-date">📅 ${new Date(card.createdAt).toLocaleDateString()}</p>
          <div class="card-actions">
            <button class="card-btn edit" onclick="window.loadCard(${card.id})">✏️ Редактировать</button>
            <button class="card-btn delete" onclick="window.deleteCard(${card.id})">🗑️ Удалить</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


document.getElementById('btn-logout')?.addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/';
});

document.getElementById('btn-new-card')?.addEventListener('click', () => {
  window.location.href = '/editor';
});

window.loadCard = async (id) => {
  try {
    const card = await apiCall(`/cards/${id}`);
    localStorage.setItem('tempCard', card.data);
    window.location.href = '/editor';
  } catch (err) {
    alert(err.message);
  }
};

window.deleteCard = async (id) => {
  if (confirm('Удалить открытку?')) {
    await apiCall(`/cards/${id}`, { method: 'DELETE' });
    location.reload();
  }
};
