// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import meTokenRouter from './routes/meToken.js';     // if you need it
import meCoinsRouter from './routes/meCoin.js';      // exposes /meCoins and /meSellStatus

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());

// Static UI
app.use(express.static(path.join(__dirname)));

// API
app.use('/api', meCoinsRouter);
app.use('/api', meTokenRouter); // optional, if you actually need it

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => console.log(`UI server on http://localhost:${PORT}`));
