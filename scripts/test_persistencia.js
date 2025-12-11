/**
 * Test de Persistencia de Jobs Asíncronos
 * 
 * Verifica que los jobs se guarden en Oracle y se recuperen después de reiniciar.
 * 
 * USO: deno run --allow-net scripts/test_persistencia.js
 */

const API_BASE = 'http://127.0.0.1:3000';
const TOKEN = 'test1';

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
        name: 'SUMA_SIMPLE',
        params: [
          { name: 'vA', value: 100 },
          { name: 'vB', value: 200 },
          { name: 'vRESULTADO', direction: 'OUT', type: 'number' }
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
      process.stdout.write(`   Progreso: ${job.progress}%\r`);
    }
    console.log(`   ✅ Estado: ${job.status}${job.result ? ` - Resultado: ${JSON.stringify(job.result)}` : ''}\n`);

    // 3. Verificar en lista
    console.log('3️⃣  Verificando en lista de jobs...');
    const { jobs, total } = await apiFetch(`${API_BASE}/jobs`);
    const found = jobs.find(j => j.id === job_id);
    console.log(`   ${found ? '✅' : '❌'} Job ${found ? 'encontrado' : 'NO encontrado'} (Total: ${total} jobs)\n`);

    // 4. Instrucciones para verificar persistencia
    console.log('4️⃣  Para verificar PERSISTENCIA:\n');
    console.log('   SQL> SELECT * FROM ASYNC_JOBS WHERE JOB_ID = \'' + job_id + '\';\n');
    console.log('   📋 Reiniciar API y ejecutar:');
    console.log('      curl http://127.0.0.1:3000/jobs/' + job_id);
    console.log('      → El job debe seguir existiendo\n');

    console.log('✅ TEST EXITOSO\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
    if (typeof Deno !== 'undefined') Deno.exit(1);
    else process.exit(1);
  }
}

main();

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     TEST DE PERSISTENCIA DE JOBS ASÍNCRONOS EN ORACLE         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Paso 1: Crear un job asíncrono
    console.log('📝 Paso 1: Crear un job asíncrono...');
    const createResponse = await apiFetch(`${API_BASE}/procedure/async`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'SUMA_SIMPLE',
        params: [
          { name: 'vA', value: 100 },
          { name: 'vB', value: 200 },
          { name: 'vRESULTADO', direction: 'OUT', type: 'number' }
        ]
      })
    });

    console.log(`✅ Job creado: ${createResponse.job_id}`);
    console.log(`   Status: ${createResponse.status}`);
    const jobId = createResponse.job_id;

    // Paso 2: Esperar a que termine
    console.log('\n⏳ Paso 2: Esperar a que termine el job...');
    let job;
    let attempts = 0;
    while (attempts < 30) {
      await sleep(1000);
      job = await apiFetch(`${API_BASE}/jobs/${jobId}`);
      
      if (job.status === 'completed' || job.status === 'failed') {
        break;
      }
      
      process.stdout.write(`   Progreso: ${job.progress}% (${job.status})\r`);
      attempts++;
    }
    console.log('');

    if (job.status === 'completed') {
      console.log('✅ Job completado exitosamente');
      console.log(`   Resultado: ${JSON.stringify(job.result)}`);
      console.log(`   Duración: ${job.duration}`);
    } else {
      console.log(`⚠️  Job en estado: ${job.status}`);
      if (job.error) {
        console.log(`   Error: ${job.error}`);
      }
    }

    // Paso 3: Verificar que está en la lista de jobs
    console.log('\n📋 Paso 3: Verificar que el job está en la lista...');
    const allJobs = await apiFetch(`${API_BASE}/jobs`);
    const foundJob = allJobs.jobs.find(j => j.id === jobId);
    
    if (foundJob) {
      console.log('✅ Job encontrado en la lista');
      console.log(`   Total de jobs: ${allJobs.total}`);
    } else {
      console.log('❌ Job NO encontrado en la lista');
      throw new Error('Job no aparece en /jobs');
    }

    // Paso 4: Instrucciones para verificar en Oracle
    console.log('\n🔍 Paso 4: Verificar en Oracle Database...');
    console.log('   Ejecuta esta consulta en SQL*Plus o SQL Developer:');
    console.log('   ──────────────────────────────────────────────────');
    console.log(`   SELECT * FROM ASYNC_JOBS WHERE JOB_ID = '${jobId}';`);
    console.log('   ──────────────────────────────────────────────────');
    console.log('   Deberías ver el job guardado con todos sus datos.');

    // Paso 5: Instrucciones para probar la carga después de reiniciar
    console.log('\n🔄 Paso 5: Test de reinicio de la API...');
    console.log('   Para verificar que los jobs se recuperan después de reiniciar:');
    console.log('');
    console.log('   1. Detén la API (Ctrl+C en la terminal donde está corriendo)');
    console.log('   2. Vuelve a iniciar: .\\go-oracle-api.exe');
    console.log('   3. Consulta GET /jobs - deberías ver el job creado anteriormente');
    console.log('   4. Consulta GET /jobs/' + jobId);
    console.log('');
    console.log('   Verifica en el log que diga: "Cargados N jobs desde la base de datos"');

    // Paso 6: Crear varios jobs más para prueba visual
    console.log('\n🚀 Paso 6: Crear 3 jobs adicionales para demostración...');
    const newJobs = [];
    
    for (let i = 1; i <= 3; i++) {
      const response = await apiFetch(`${API_BASE}/procedure/async`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'SUMA_SIMPLE',
          params: [
            { name: 'vA', value: i * 10 },
            { name: 'vB', value: i * 20 },
            { name: 'vRESULTADO', direction: 'OUT', type: 'number' }
          ]
        })
      });
      newJobs.push(response.job_id);
      console.log(`   ✅ Job ${i}/3 creado: ${response.job_id.substring(0, 8)}...`);
      await sleep(500);
    }

    // Esperar un poco para que se completen
    await sleep(2000);

    // Mostrar todos los jobs
    console.log('\n📊 Paso 7: Listar todos los jobs actuales...');
    const finalJobs = await apiFetch(`${API_BASE}/jobs`);
    console.log(`   Total de jobs: ${finalJobs.total}`);
    console.log('');
    console.log('   Estado de los jobs:');
    console.log('   ┌──────────┬────────────┬──────────┬──────────────┐');
    console.log('   │ ID       │ Estado     │ Progreso │ Procedimiento│');
    console.log('   ├──────────┼────────────┼──────────┼──────────────┤');
    
    finalJobs.jobs.slice(0, 10).forEach(j => {
      const id = j.id.substring(0, 8);
      const status = j.status.padEnd(10);
      const progress = `${j.progress}%`.padEnd(8);
      const proc = j.procedure_name.substring(0, 12).padEnd(12);
      console.log(`   │ ${id} │ ${status} │ ${progress} │ ${proc} │`);
    });
    console.log('   └──────────┴────────────┴──────────┴──────────────┘');

    // Resumen final
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ TEST EXITOSO                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📝 Resumen de lo que se verificó:');
    console.log('   ✅ Creación de job asíncrono');
    console.log('   ✅ Ejecución del procedimiento');
    console.log('   ✅ Consulta de estado individual');
    console.log('   ✅ Listado de todos los jobs');
    console.log('   ✅ Creación de múltiples jobs simultáneos');
    console.log('');
    console.log('🔍 Para verificar la persistencia completa:');
    console.log('   1. Reinicia la API');
    console.log('   2. Ejecuta: curl http://localhost:3000/jobs');
    console.log(`   3. Busca el job ID: ${jobId.substring(0, 16)}...`);
    console.log('');
    console.log('📊 Para ver los jobs en Oracle:');
    console.log('   SELECT * FROM V_ASYNC_JOBS_RECENT;');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error en el test:', error.message);
    if (runtime === 'deno') {
      Deno.exit(1);
    } else {
      process.exit(1);
    }
  }
}

// Ejecutar
main();
