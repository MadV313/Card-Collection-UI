// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import meCoinsRouter from './routes/meCoins.js';   // ✅ corrected plural form

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static UI
app.use(express.static(path.join(__dirname)));

// API endpoints
app.use('/api', meCoinsRouter);

const PORT = process.env.PORT || 5173;
app.listen(PORT, () =>
  console.log(`✅ Card Collection UI running at http://localhost:${PORT}`)
);
