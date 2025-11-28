require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes } = require('sequelize');

// База данных
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DB_PATH || './database.sqlite'
});

const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false }
});

const Card = sequelize.define('Card', {
  title: { type: DataTypes.STRING, defaultValue: "Новая открытка" },
  data: { type: DataTypes.TEXT, allowNull: false }
});

User.hasMany(Card, { onDelete: 'CASCADE' });
Card.belongsTo(User);

(async () => {
  await sequelize.sync();
  console.log('✅ База данных готова');
})();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(express.json());
app.use(express.static('public'));

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Неверный токен' });
  }
}

// API - Регистрация
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const exists = await User.findOne({ where: { username } });
    if (exists) return res.status(409).json({ error: 'Пользователь существует' });
    
    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash: hash });
    const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username } });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API - Вход
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Неверный логин/пароль' });
    }
    const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username } });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API - Открытки
app.get('/api/cards', authMiddleware, async (req, res) => {
  const cards = await Card.findAll({ where: { UserId: req.user.id }, order: [['updatedAt', 'DESC']] });
  res.json(cards);
});

app.post('/api/cards', authMiddleware, async (req, res) => {
  try {
    const { title, data } = req.body;
    const card = await Card.create({ title: title || `Открытка ${new Date().toLocaleDateString()}`, data, UserId: req.user.id });
    res.json(card);
  } catch {
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.get('/api/cards/:id', authMiddleware, async (req, res) => {
  const card = await Card.findOne({ where: { id: req.params.id, UserId: req.user.id } });
  if (!card) return res.status(404).json({ error: 'Не найдена' });
  res.json(card);
});

app.put('/api/cards/:id', authMiddleware, async (req, res) => {
  const card = await Card.findOne({ where: { id: req.params.id, UserId: req.user.id } });
  if (!card) return res.status(404).json({ error: 'Не найдена' });
  const { title, data } = req.body;
  if (title) card.title = title;
  if (data) card.data = data;
  await card.save();
  res.json(card);
});

app.delete('/api/cards/:id', authMiddleware, async (req, res) => {
  const card = await Card.findOne({ where: { id: req.params.id, UserId: req.user.id } });
  if (!card) return res.status(404).json({ error: 'Не найдена' });
  await card.destroy();
  res.json({ success: true });
});

// Статические страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/profile.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);
});
