const { Client } = require('pg');
const c = new Client({
  host: 'dpg-d9ibjtcm0tmc73cj16p0-a.frankfurt-postgres.render.com',
  port: 5432,
  database: 'eeg_db_mzlf',
  user: 'eeg_db_mzlf_user',
  password: 'ZRtGPwK3GsUTzPrdJ0uGuMvnkuzHyrVR',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const cols = await c.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='eeg_demande' ORDER BY ordinal_position",
  );
  console.log('COLONNES:', cols.rows.map((r) => r.column_name).join(', '));
  const r = await c.query(
    'SELECT d.id, d."numeroEEG", d."dateCreation", d."dateRealisation", d."dateValidation", d.statut, d."prescriptionSourceId" FROM "eeg_demande" d ORDER BY d."numeroEEG" DESC LIMIT 6',
  );
  for (const d of r.rows) {
    const epoch = d.numeroEEG && d.numeroEEG.startsWith('EEG-') ? Number(d.numeroEEG.slice(4)) : null;
    console.log('---');
    console.log('numeroEEG    :', d.numeroEEG, '| epoch ->', epoch ? new Date(epoch).toISOString() : '-');
    console.log('dateCreation :', d.dateCreation?.toISOString?.() ?? d.dateCreation);
    console.log('realis/valid :', d.dateRealisation?.toISOString?.() ?? '-', '/', d.dateValidation?.toISOString?.() ?? '-');
    console.log('statut       :', d.statut);
  }
  await c.end();
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
