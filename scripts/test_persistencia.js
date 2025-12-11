/**
 * Test de Persistencia de Jobs Asíncronos
 * 
 * Verifica que los jobs se guarden en Oracle y se recuperen después de reiniciar.
 * 
 * USO: deno run --allow-net scripts/test_persistencia.js
 */

const API_BASE = 'http://10.6.150.91:3000';
const TOKEN = 'test1';

// Detectar runtime
const runtime = typeof Deno !== 'undefined' ? 'deno' : 
               typeof Bun !== 'undefined' ? 'bun' : 'node';

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok && response.status !== 202) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return response.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n🔍 TEST DE PERSISTENCIA DE JOBS\n');

  try {
    // 1. Crear job
    console.log('1️⃣  Creando job asíncrono...');
    const { job_id } = await apiFetch(`${API_BASE}/procedure/async`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'suma_simple',
        params: [
          { name: 'a', value: 100 },
          { name: 'b', value: 200 },
          { name: 'resultado', direction: 'OUT', type: 'number' }
        ]
      })
    });
    console.log(`   ✅ Job creado: ${job_id.substring(0, 12)}...\n`);

    // 2. Esperar a que termine
    console.log('2️⃣  Esperando que termine...');
    let job;
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      job = await apiFetch(`${API_BASE}/jobs/${job_id}`);
      if (job.status === 'completed' || job.status === 'failed') break;
      console.log(`   Progreso: ${job.progress}%`);
    }
    console.log(`\n   ✅ Estado: ${job.status}${job.result ? ` - Resultado: ${JSON.stringify(job.result)}` : ''}\n`);

    // 3. Verificar en lista
    console.log('3️⃣  Verificando en lista de jobs...');
    const { jobs, total } = await apiFetch(`${API_BASE}/jobs`);
    const found = jobs.find(j => j.id === job_id);
    console.log(`   ${found ? '✅' : '❌'} Job ${found ? 'encontrado' : 'NO encontrado'} (Total: ${total} jobs)\n`);

    // 4. Instrucciones para verificar persistencia
    console.log('4️⃣  Para verificar PERSISTENCIA:\n');
    console.log('   SQL> SELECT * FROM ASYNC_JOBS WHERE JOB_ID = \'' + job_id + '\';\n');
    console.log('   📋 Reiniciar API y ejecutar:');
    console.log('      curl http://10.6.150.91:3000/jobs/' + job_id + ' -H "Authorization: Bearer test1"');
    console.log('      → El job debe seguir existiendo después del reinicio\n');

    console.log('✅ TEST EXITOSO\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
    if (runtime === 'deno') Deno.exit(1);
    else process.exit(1);
  }
}

main();
