import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

async function getAccountId(userId: number) {
  const result = await pool.query('SELECT account_id FROM users WHERE id = $1 AND is_admin = TRUE', [userId]);
  return result.rows[0]?.account_id as number | undefined;
}

const normalize = (value: unknown) => typeof value === 'string' ? value.trim() : '';

router.get('/profile', requireAdmin, async (req, res) => {
  try {
    const accountId = await getAccountId(req.userId);
    if (!accountId) return res.status(403).json({ error: 'Conta administrativa sem empresa associada' });
    const result = await pool.query(
      `SELECT id, legal_name, trade_name, document, phone, email, whatsapp, website,
              address, number, complement, neighborhood, city, state, postal_code,
              logo_key, description, updated_at
       FROM company_profiles WHERE account_id = $1`, [accountId]
    );
    const c = result.rows[0];
    if (!c) return res.json(null);
    res.json({
      id: c.id, legalName: c.legal_name || '', tradeName: c.trade_name || '', document: c.document || '',
      phone: c.phone || '', whatsapp: c.whatsapp || '', email: c.email || '', website: c.website || '',
      address: c.address || '', number: c.number || '', complement: c.complement || '', neighborhood: c.neighborhood || '',
      city: c.city || '', state: c.state || '', postalCode: c.postal_code || '', logoKey: c.logo_key || '',
      description: c.description || '', updatedAt: c.updated_at,
    });
  } catch (error) {
    console.error('Erro ao carregar perfil da empresa:', error);
    res.status(500).json({ error: 'Erro ao carregar perfil da empresa' });
  }
});

router.put('/profile', requireAdmin, async (req, res) => {
  try {
    const accountId = await getAccountId(req.userId);
    if (!accountId) return res.status(403).json({ error: 'Conta administrativa sem empresa associada' });

    const data = {
      legalName: normalize(req.body?.legalName), tradeName: normalize(req.body?.tradeName), document: normalize(req.body?.document),
      phone: normalize(req.body?.phone), whatsapp: normalize(req.body?.whatsapp), email: normalize(req.body?.email).toLowerCase(),
      website: normalize(req.body?.website), address: normalize(req.body?.address), number: normalize(req.body?.number),
      complement: normalize(req.body?.complement), neighborhood: normalize(req.body?.neighborhood), city: normalize(req.body?.city),
      state: normalize(req.body?.state).toUpperCase().slice(0, 2), postalCode: normalize(req.body?.postalCode),
      logoKey: normalize(req.body?.logoKey), description: normalize(req.body?.description),
    };

    if (!data.tradeName && !data.legalName) return res.status(400).json({ error: 'Informe pelo menos a razão social ou o nome fantasia' });

    const result = await pool.query(
      `INSERT INTO company_profiles
        (account_id, legal_name, trade_name, document, phone, whatsapp, email, website,
         address, number, complement, neighborhood, city, state, postal_code, logo_key, description, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
       ON CONFLICT (account_id) DO UPDATE SET
         legal_name=EXCLUDED.legal_name, trade_name=EXCLUDED.trade_name, document=EXCLUDED.document,
         phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, email=EXCLUDED.email, website=EXCLUDED.website,
         address=EXCLUDED.address, number=EXCLUDED.number, complement=EXCLUDED.complement,
         neighborhood=EXCLUDED.neighborhood, city=EXCLUDED.city, state=EXCLUDED.state,
         postal_code=EXCLUDED.postal_code, logo_key=EXCLUDED.logo_key, description=EXCLUDED.description,
         updated_at=NOW()
       RETURNING id, legal_name, trade_name, document, phone, whatsapp, email, website,
                 address, number, complement, neighborhood, city, state, postal_code, logo_key, description, updated_at`,
      [accountId, data.legalName, data.tradeName, data.document, data.phone, data.whatsapp, data.email, data.website,
       data.address, data.number, data.complement, data.neighborhood, data.city, data.state, data.postalCode, data.logoKey, data.description]
    );

    const c = result.rows[0];
    res.json({
      id: c.id, legalName: c.legal_name || '', tradeName: c.trade_name || '', document: c.document || '', phone: c.phone || '',
      whatsapp: c.whatsapp || '', email: c.email || '', website: c.website || '', address: c.address || '', number: c.number || '',
      complement: c.complement || '', neighborhood: c.neighborhood || '', city: c.city || '', state: c.state || '',
      postalCode: c.postal_code || '', logoKey: c.logo_key || '', description: c.description || '', updatedAt: c.updated_at,
    });
  } catch (error) {
    console.error('Erro ao salvar perfil da empresa:', error);
    res.status(500).json({ error: 'Erro ao salvar perfil da empresa' });
  }
});

export default router;
