const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* Serve all static files from this directory */
app.use(express.static(__dirname));

/* /dashboard → dashboard.html (no .html extension in URL) */
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

/* Fallback: root → index.html */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`HOPE 702 running on port ${PORT}`);
});
