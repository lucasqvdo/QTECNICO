import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import authRouter from './routes/auth.js';
import ordersRouter from './routes/orders.js';
import clientsRouter from './routes/clients.js';
import usersRouter from './routes/users.js';
import uploadsRouter from './routes/uploads.js';
import webauthnRouter from './routes/webauthn.js';
import dashboardRouter from './routes/dashboard.js';
import backofficeRouter from './routes/backoffice.js';
import billingRouter from './routes/billing.js';

import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/api/auth', authRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/users', usersRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/auth/webauthn', webauthnRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/dashboard/backoffice', backofficeRouter);
app.use('/api/dashboard', billingRouter);
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api')) {
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    return res.status(500).json({ error: 'Erro interno da API' });
  }
  next(error);
});

async function initDb() {
  try {
    // The existing database bootstrap/migrations continue below unchanged.
