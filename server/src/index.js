import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { api } from './routes/api.js';
import { pool } from './db.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', api);

app.use((req, res) => {
  res.status(404).json({ error: `no route for ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'internal server error' });
});

const server = app.listen(config.port, () => {
  console.log(`SAP monitoring API listening on http://localhost:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
