/**
 * Migra fotos e assinaturas salvas em base64 diretamente no Postgres para o
 * bucket R2, substituindo o conteúdo da coluna pela URL pública resultante.
 *
 * Rodar UMA VEZ, depois de configurar as variáveis R2_* no ambiente:
 *   npx tsx server/scripts/migrate-photos-to-r2.ts
 *
 * Faz backup implícito: só sobrescreve a linha depois que o upload pro R2
 * confirma sucesso, então uma falha no meio do caminho não perde dados —
 * basta rodar o script de novo (ele pula linhas que já são URL http).
 */
import { pool } from '../db.js';
import { uploadImage, isStorageConfigured } from '../storage.js';

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimetype: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimetype: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function migrateTable(
  table: string,
  idColumn: string,
  dataColumn: string,
  folder: string
) {
  const { rows } = await pool.query(
    `SELECT ${idColumn} as id, ${dataColumn} as data FROM ${table} WHERE ${dataColumn} LIKE 'data:%'`
  );

  console.log(`${table}.${dataColumn}: ${rows.length} registro(s) em base64 para migrar`);

  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    const parsed = parseDataUrl(row.data);
    if (!parsed) {
      console.warn(`  [pulado] ${table} id=${row.id}: formato de data URL não reconhecido`);
      fail++;
      continue;
    }
    try {
      const url = await uploadImage(parsed.buffer, parsed.mimetype, folder);
      await pool.query(`UPDATE ${table} SET ${dataColumn} = $1 WHERE ${idColumn} = $2`, [url, row.id]);
      ok++;
    } catch (e) {
      console.error(`  [erro] ${table} id=${row.id}:`, e);
      fail++;
    }
  }

  console.log(`${table}.${dataColumn}: ${ok} migrado(s), ${fail} falha(s)/pulado(s)`);
}

async function main() {
  if (!isStorageConfigured()) {
    console.error('Variáveis R2_* não configuradas. Configure-as antes de rodar a migração.');
    process.exit(1);
  }

  await migrateTable('attendance_photos', 'id', 'data_url', 'attendances');
  await migrateTable('orders', 'id', 'client_signature', 'signatures');
  await migrateTable('users', 'id', 'photo_url', 'profiles');

  console.log('Migração concluída.');
  await pool.end();
}

main().catch(e => {
  console.error('Erro fatal na migração:', e);
  process.exit(1);
});
