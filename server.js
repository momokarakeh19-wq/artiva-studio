const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'artiva2026';

const DATA_FILE = path.join(__dirname, 'paintings.json');

app.use(express.json({ limit: '12mb' }));
app.use(express.static(__dirname));

function readPaintings() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writePaintings(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

function checkAuth(req, res, next) {
  const pw = req.headers['x-admin-password'];
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  next();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/paintings', (req, res) => {
  res.json(readPaintings());
});

app.post('/api/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

app.post('/api/paintings', checkAuth, (req, res) => {
  const { title, price, status, dimensions, technique, description, image } = req.body;
  if (!title || !price || !image) {
    return res.status(400).json({ error: 'Champs manquants' });
  }
  const id = 'p_' + Date.now();
  let imagePath = '';
  try {
    const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      imagePath = `/${id}.${ext}`;
      fs.writeFileSync(path.join(__dirname, `${id}.${ext}`), buffer);
    }
  } catch (e) {
    return res.status(400).json({ error: 'Image invalide' });
  }

  const list = readPaintings();
  const entry = {
    id, title, price, status: status || 'available',
    dimensions: dimensions || '', technique: technique || '',
    description: description || '', image: imagePath
  };
  list.unshift(entry);
  writePaintings(list);
  res.json(entry);
});

app.put('/api/paintings/:id', checkAuth, (req, res) => {
  const list = readPaintings();
  const idx = list.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Introuvable' });

  const { title, price, status, dimensions, technique, description, image } = req.body;
  const current = list[idx];

  if (image && image.startsWith('data:image')) {
    try {
      const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const imagePath = `/${current.id}.${ext}`;
        fs.writeFileSync(path.join(__dirname, `${current.id}.${ext}`), Buffer.from(matches[2], 'base64'));
        current.image = imagePath;
      }
    } catch (e) {
      return res.status(400).json({ error: 'Image invalide' });
    }
  }

  current.title = title ?? current.title;
  current.price = price ?? current.price;
  current.status = status ?? current.status;
  current.dimensions = dimensions ?? current.dimensions;
  current.technique = technique ?? current.technique;
  current.description = description ?? current.description;

  list[idx] = current;
  writePaintings(list);
  res.json(current);
});

app.delete('/api/paintings/:id', checkAuth, (req, res) => {
  let list = readPaintings();
  const entry = list.find(p => p.id === req.params.id);
  list = list.filter(p => p.id !== req.params.id);
  writePaintings(list);
  if (entry && entry.image) {
    fs.unlink(path.join(__dirname, entry.image), () => {});
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Artiva Studio en ligne sur le port ${PORT}`);
});
