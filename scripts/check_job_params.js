/**
 * Script para verificar parámetros en jobs
 * USO: deno run --allow-net scripts/check_job_params.js
 */

const API_BASE = 'http://10.6.150.91:3000';
const TOKEN = 'test1';

async function main() {
  console.log('\n🔍 VERIFICANDO PARÁMETROS EN JOBS\n');

  try {
    // 1. Obtener todos los jobs
    const listRes = await fetch(`${API_BASE}/jobs`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });

    if (!listRes.ok) {
      throw new Error(`Error al listar jobs: ${listRes.status}`);
    }

    const { jobs, total } = await listRes.json();
    console.log(`📋 Total de jobs: ${total}\n`);

    // 2. Mostrar jobs con parámetros
    const jobsWithParams = jobs.filter(j => j.params);
    console.log(`✅ Jobs con parámetros guardados: ${jobsWithParams.length}\n`);

    if (jobsWithParams.length > 0) {
      const job = jobsWithParams[0];
      
      console.log('📝 Ejemplo de Job con Parámetros:\n');
      console.log(`ID: ${job.id}`);
      console.log(`Procedimiento: ${job.procedure_name}`);
      console.log(`Estado: ${job.status}`);
      console.log(`\nParámetros:`);
      console.log(JSON.stringify(job.params, null, 2));
      
      if (job.result) {
        console.log(`\nResultado:`);
        console.log(JSON.stringify(job.result, null, 2));
      }
      
      // 3. Consultar el mismo job individualmente
      console.log(`\n\n🔎 Consultando job individual: ${job.id.substring(0, 10)}...\n`);
      
      const jobRes = await fetch(`${API_BASE}/jobs/${job.id}`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
      });
      
      const singleJob = await jobRes.json();
      
      console.log('Response completa del endpoint /jobs/{id}:');
      console.log(JSON.stringify(singleJob, null, 2));
    } else {
      console.log('⚠️  No hay jobs con parámetros guardados aún.');
      console.log('Ejecuta: deno run --allow-net scripts/test_async.js\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
  }
}

main();
