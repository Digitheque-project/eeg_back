const { Client } = require('pg');

const client = new Client({
  host: 'dpg-d883uue7r5hc73f8emng-a.oregon-postgres.render.com',
  port: 5432,
  database: 'chu_eeg_bd',
  user: 'chu_eeg_bd_user',
  password: 'bNMRUt3Kni2fTmDnWzr9YZMBJFstROgr',
  ssl: {
    rejectUnauthorized: false
  }
});

(async () => {
  try {
    console.log('Connexion...');
    await client.connect();

    console.log('Connecté avec succès');

    const result = await client.query('SELECT NOW()');
    console.log(result.rows);

    await client.end();
  } catch (err) {
    console.error('Erreur complète :');
    console.error(err);
  }
})();
