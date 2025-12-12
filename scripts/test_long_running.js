/**
 * Test de procedimientos de larga duración
 * Verifica que no se pierda la conexión y se actualice correctamente
 * 
 * USO: deno run --allow-net scripts/test_long_running.js
 */

const API_BASE = 'http://10.6.150.91:3000';
const TOKEN = 'test1';

async function testLongRunning() {
  console.log('\n⏱️  TEST DE PROCEDIMIENTOS DE LARGA DURACIÓN\n');

  try {
    // Test 1: Procedimiento de 30 segundos
    console.log('1️⃣  Iniciando procedimiento de 30 segundos...');
    const job1 = await createJob({
      name: 'PROCESO_LARGO_TEST',
      params: [
        { name: 'p_segundos', value: 30 },
        { name: 'p_resultado', direction: 'OUT', type: 'string' }
      ]
    });
    console.log(`   Job ID: ${job1.job_id}`);

    // Monitorear progreso cada 5 segundos
    let status = 'pending';
    let checks = 0;
    const startTime = Date.now();

    while (status !== 'completed' && status !== 'failed' && checks < 20) {
      await sleep(5000);
      checks++;
      
      const jobStatus = await getJob(job1.job_id);
      status = jobStatus.status;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`   [${elapsed}s] Estado: ${status} | Progreso: ${jobStatus.progress}%`);
      
      if (status === 'completed') {
        console.log(`   ✅ Completado exitosamente`);
        console.log(`   Resultado: ${JSON.stringify(jobStatus.result)}`);
        console.log(`   Duración real: ${jobStatus.duration}`);
        break;
      } else if (status === 'failed') {
        console.log(`   ❌ Falló: ${jobStatus.error}`);
        break;
      }
    }

    if (status !== 'completed' && status !== 'failed') {
      console.log(`   ⚠️  Timeout alcanzado después de ${checks * 5} segundos`);
      console.log(`   Estado final: ${status}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESULTADO DEL TEST:');
    console.log(`   Estado final: ${status}`);
    console.log(`   ${status === 'completed' ? '✅ Job largo completado sin pérdida de conexión' : '❌ Hubo un problema'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error en test:', error.message, '\n');
  }
}

async function createJob(payload) {
  const response = await fetch(`${API_BASE}/procedure/async`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json();
}

async function getJob(jobId) {
  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testLongRunning();
