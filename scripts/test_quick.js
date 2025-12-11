/**
 * Test Rápido - Verifica conectividad básica
 * USO: deno run --allow-net scripts/test_quick.js
 */

const API_BASE = 'http://10.6.150.91:3000';
const TOKEN = 'test1';

async function main() {
  console.log('\n⚡ TEST RÁPIDO\n');

  try {
    // 1. Ping
    console.log('1️⃣  Probando /ping...');
    const pingRes = await fetch(`${API_BASE}/ping`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const ping = await pingRes.json();
    console.log(`   ✅ ${ping.message}\n`);

    // 2. Crear job async
    console.log('2️⃣  Creando job asíncrono...');
    const asyncRes = await fetch(`${API_BASE}/procedure/async`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'suma_simple',
        params: [
          { name: 'a', value: 5 },
          { name: 'b', value: 3 },
          { name: 'resultado', direction: 'OUT' }
        ]
      })
    });
    const { job_id } = await asyncRes.json();
    console.log(`   ✅ Job: ${job_id.substring(0, 12)}...\n`);

    // 3. Esperar 2 segundos
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Consultar estado
    console.log('3️⃣  Consultando estado...');
    const jobRes = await fetch(`${API_BASE}/jobs/${job_id}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const job = await jobRes.json();
    console.log(`   ✅ Estado: ${job.status}, Progreso: ${job.progress}%`);
    if (job.result) console.log(`   ✅ Resultado: ${JSON.stringify(job.result)}`);

    // 5. Listar jobs
    console.log('\n4️⃣  Listando jobs...');
    const listRes = await fetch(`${API_BASE}/jobs`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const { total } = await listRes.json();
    console.log(`   ✅ Total de jobs: ${total}\n`);

    console.log('✅ TEST EXITOSO - Todos los endpoints funcionan\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
    if (typeof Deno !== 'undefined') Deno.exit(1);
    else process.exit(1);
  }
}

main();
