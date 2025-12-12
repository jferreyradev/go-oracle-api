/**
 * Test de manejo de errores en procedimientos asíncronos
 * USO: deno run --allow-net scripts/test_error_handling.js
 */

const API_BASE = 'http://10.6.150.91:3000';
const TOKEN = 'test1';

async function testErrorHandling() {
  console.log('\n🧪 TEST DE MANEJO DE ERRORES EN JOBS ASÍNCRONOS\n');

  try {
    // Test 1: Procedimiento que no existe
    console.log('1️⃣  Test: Procedimiento inexistente');
    const errorJob = await createJob({
      name: 'PROCEDIMIENTO_INEXISTENTE',
      params: [
        { name: 'param1', value: 123 }
      ]
    });
    console.log(`   Job ID: ${errorJob.job_id}`);
    
    await sleep(3000);
    const errorResult = await getJob(errorJob.job_id);
    console.log(`   Estado final: ${errorResult.status}`);
    console.log(`   Error: ${errorResult.error?.substring(0, 80)}...`);
    console.log(`   ✅ ${errorResult.status === 'failed' ? 'Error capturado correctamente' : '❌ No se registró el error'}\n`);

    // Test 2: Parámetros incorrectos
    console.log('2️⃣  Test: Parámetros incorrectos');
    const badParamsJob = await createJob({
      name: 'suma_simple',
      params: [
        { name: 'a', value: 'texto_invalido' }  // Debería ser número
      ]
    });
    console.log(`   Job ID: ${badParamsJob.job_id}`);
    
    await sleep(3000);
    const badParamsResult = await getJob(badParamsJob.job_id);
    console.log(`   Estado final: ${badParamsResult.status}`);
    if (badParamsResult.error) {
      console.log(`   Error: ${badParamsResult.error.substring(0, 80)}...`);
    }
    console.log(`   ✅ ${badParamsResult.status === 'failed' ? 'Error capturado correctamente' : '❌ No se registró el error'}\n`);

    // Test 3: Procedimiento exitoso (control)
    console.log('3️⃣  Test: Procedimiento exitoso (control)');
    const successJob = await createJob({
      name: 'suma_simple',
      params: [
        { name: 'a', value: 50 },
        { name: 'b', value: 75 },
        { name: 'resultado', direction: 'OUT', type: 'number' }
      ]
    });
    console.log(`   Job ID: ${successJob.job_id}`);
    
    await sleep(3000);
    const successResult = await getJob(successJob.job_id);
    console.log(`   Estado final: ${successResult.status}`);
    console.log(`   Resultado: ${JSON.stringify(successResult.result)}`);
    console.log(`   Duración: ${successResult.duration}`);
    console.log(`   ✅ ${successResult.status === 'completed' ? 'Completado correctamente' : '❌ No se completó'}\n`);

    // Resumen
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESUMEN:');
    console.log(`   • Error de procedimiento: ${errorResult.status === 'failed' ? '✅' : '❌'}`);
    console.log(`   • Error de parámetros: ${badParamsResult.status === 'failed' ? '✅' : '❌'}`);
    console.log(`   • Procedimiento exitoso: ${successResult.status === 'completed' ? '✅' : '❌'}`);
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

testErrorHandling();
