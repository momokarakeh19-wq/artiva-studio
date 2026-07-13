const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'artiva2026';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // format: "username/repo"
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const DATA_PATH = 'paintings.json';

app.use(express.json({ limit: '12mb' }));

function ghHeaders() {
  return {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'artiva-studio-app',
    'Accept': 'application/vnd.github+json'
  };
}

function rawImageUrl(filename) {
  return `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filename}?t=${Date.now()}`;
}

async function ghGetFile(path) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}&t=${Date.now()}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
  const json = await res.json();
  return { sha: json.sha, content: Buffer.from(json.content, 'base64').toString('utf-8') };
}

async function ghPutFile(path, contentBase64, sha, message) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
  const body = { message, content: contentBase64, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub PUT ${path} failed: ${res.status} ${errText}`);
  }
  return res.json();
}

async function readPaintings() {
  const file = await ghGetFile(DATA_PATH);
  if (!file) return [];
  try { return JSON.parse(file.content); } catch (e) { return []; }
}

async function writePaintings(list, message) {
  const existing = await ghGetFile(DATA_PATH);
  const contentBase64 = Buffer.from(JSON.stringify(list, null, 2)).toString('base64');
  await ghPutFile(DATA_PATH, contentBase64, existing ? existing.sha : null, message);
}

function checkAuth(req, res, next) {
  const pw = req.headers['x-admin-password'];
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Mot de passe incorrect' });
  next();
}

app.get('/', async (req, res) => {
  try {
    const file = await ghGetFile('index.html');
    if (!file) return res.status(404).send('index.html introuvable sur le repo');
    res.set('Content-Type', 'text/html; charset=utf-8').send(file.content);
  } catch (e) {
    res.status(500).send('Erreur de chargement: ' + e.message);
  }
});

app.get('/api/paintings', async (req, res) => {
  try {
    res.json(await readPaintings());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

app.post('/api/paintings', checkAuth, async (req, res) => {
  try {
    const { title, price, status, dimensions, technique, description, image } = req.body;
    if (!title || !price || !image) return res.status(400).json({ error: 'Champs manquants' });

    const id = 'p_' + Date.now();
    const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Image invalide' });
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const filename = `${id}.${ext}`;
    await ghPutFile(filename, matches[2], null, `Ajout image ${filename}`);

    const list = await readPaintings();
    const entry = {
      id, title, price, status: status || 'available',
      dimensions: dimensions || '', technique: technique || '',
      description: description || '', image: rawImageUrl(filename)
    };
    list.unshift(entry);
    await writePaintings(list, `Ajout toile: ${title}`);
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/paintings/:id', checkAuth, async (req, res) => {
  try {
    const list = await readPaintings();
    const idx = list.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Introuvable' });

    const { title, price, status, dimensions, technique, description, image } = req.body;
    const current = list[idx];

    if (image && image.startsWith('data:image')) {
      const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const filename = `${current.id}.${ext}`;
        const existingImg = await ghGetFile(filename);
        await ghPutFile(filename, matches[2], existingImg ? existingImg.sha : null, `Mise à jour image ${filename}`);
        current.image = rawImageUrl(filename);
      }
    }

    current.title = title ?? current.title;
    current.price = price ?? current.price;
    current.status = status ?? current.status;
    current.dimensions = dimensions ?? current.dimensions;
    current.technique = technique ?? current.technique;
    current.description = description ?? current.description;

    list[idx] = current;
    await writePaintings(list, `Modification toile: ${current.title}`);
    res.json(current);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/paintings/:id', checkAuth, async (req, res) => {
  try {
    let list = await readPaintings();
    const entry = list.find(p => p.id === req.params.id);
    list = list.filter(p => p.id !== req.params.id);
    await writePaintings(list, `Suppression toile: ${entry ? entry.title : req.params.id}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Artiva Studio en ligne sur le port ${PORT}`);
});
