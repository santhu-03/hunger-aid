import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'hungeraid-backend' });
});

app.listen(PORT, () => {
  console.log(`HungerAid backend listening on port ${PORT}`);
});
