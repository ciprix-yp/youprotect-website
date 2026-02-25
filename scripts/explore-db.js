import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Railway requires SSL
  }
});

async function exploreTables() {
  try {
    console.log('🔍 Conectare la PostgreSQL Railway...\n');

    // List all tables
    const tablesQuery = `
      SELECT
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `;

    const result = await pool.query(tablesQuery);

    console.log(`✅ Conectat! Găsite ${result.rows.length} tabele:\n`);
    console.log('═'.repeat(80));

    // Group by schema
    const schemas = {};
    result.rows.forEach(row => {
      if (!schemas[row.table_schema]) {
        schemas[row.table_schema] = [];
      }
      schemas[row.table_schema].push(row.table_name);
    });

    for (const [schema, tables] of Object.entries(schemas)) {
      console.log(`\n📁 Schema: ${schema}`);
      console.log('─'.repeat(80));
      tables.forEach((table, idx) => {
        console.log(`  ${idx + 1}. ${table}`);
      });
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`\n🔍 Căutare tabele relevante pentru produse, prețuri, oferte...\n`);

    // Search for relevant tables
    const relevantKeywords = ['produs', 'product', 'pret', 'price', 'ofert', 'offer', 'quote', 'catalog', 'item', 'list'];
    const relevantTables = result.rows.filter(row =>
      relevantKeywords.some(keyword =>
        row.table_name.toLowerCase().includes(keyword)
      )
    );

    if (relevantTables.length > 0) {
      console.log('🎯 Tabele potențial relevante:');
      console.log('─'.repeat(80));
      for (const table of relevantTables) {
        console.log(`\n📋 ${table.table_schema}.${table.table_name}`);

        // Get column info
        const columnsQuery = `
          SELECT
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position;
        `;

        const columns = await pool.query(columnsQuery, [table.table_schema, table.table_name]);

        columns.rows.forEach(col => {
          const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
          console.log(`   - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
        });

        // Get row count
        const countQuery = `SELECT COUNT(*) as count FROM "${table.table_schema}"."${table.table_name}"`;
        const countResult = await pool.query(countQuery);
        console.log(`   📊 Rânduri: ${countResult.rows[0].count}`);
      }
    } else {
      console.log('⚠️  Nu am găsit tabele cu numele uzuale pentru produse/prețuri.');
      console.log('   Voi lista primele 10 tabele pentru inspecție manuală:\n');

      for (let i = 0; i < Math.min(10, result.rows.length); i++) {
        const table = result.rows[i];
        console.log(`\n📋 ${table.table_schema}.${table.table_name}`);

        const columnsQuery = `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position;
        `;

        const columns = await pool.query(columnsQuery, [table.table_schema, table.table_name]);
        console.log(`   Coloane: ${columns.rows.map(c => c.column_name).join(', ')}`);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ Explorare completă!\n');

  } catch (error) {
    console.error('❌ Eroare:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('   → Verifică DATABASE_URL în .env');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   → Serverul PostgreSQL nu răspunde');
    }
  } finally {
    await pool.end();
  }
}

exploreTables();
