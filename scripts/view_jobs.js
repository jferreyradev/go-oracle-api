/**
 * Visualizador de Jobs Asíncronos
 * Muestra todos los jobs de la tabla ASYNC_JOBS de forma visual
 * 
 * USO: deno run --allow-net scripts/view_jobs.js
 */

const API_BASE = 'http://10.6.150.91:3000';
const TOKEN = 'test1';

// Detectar runtime
const runtime = typeof Deno !== 'undefined' ? 'deno' : 
               typeof Bun !== 'undefined' ? 'bun' : 'node';

async function main() {
  console.log('\n📊 VISUALIZADOR DE JOBS ASÍNCRONOS\n');

  try {
    // Obtener todos los jobs
    const response = await fetch(`${API_BASE}/jobs`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const { jobs, total } = await response.json();

    if (total === 0) {
      console.log('⚠️  No hay jobs registrados\n');
      return;
    }

    console.log(`Total de jobs: ${total}\n`);

    // Mostrar tabla
    console.log('┌────────────┬────────────┬─────────────────┬──────────────────────┬──────────┬──────────┐');
    console.log('│ ID         │ Estado     │ Procedimiento   │ Inicio               │ Duración │ Progreso │');
    console.log('├────────────┼────────────┼─────────────────┼──────────────────────┼──────────┼──────────┤');

    jobs.forEach(job => {
      const id = job.id.substring(0, 10);
      const status = formatStatus(job.status);
      const proc = job.procedure_name.substring(0, 15).padEnd(15);
      const start = formatDate(job.start_time);
      const duration = job.duration || '-'.padEnd(8);
      const progress = `${job.progress}%`.padStart(4);

      console.log(`│ ${id} │ ${status} │ ${proc} │ ${start} │ ${duration.padEnd(8)} │ ${progress}    │`);
    });

    console.log('└────────────┴────────────┴─────────────────┴──────────────────────┴──────────┴──────────┘');

    // Resumen por estado
    console.log('\n📈 Resumen por Estado:');
    const completed = jobs.filter(j => j.status === 'completed').length;
    const running = jobs.filter(j => j.status === 'running').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const pending = jobs.filter(j => j.status === 'pending').length;

    if (completed > 0) console.log(`   ✅ Completados: ${completed}`);
    if (running > 0) console.log(`   🔄 En ejecución: ${running}`);
    if (failed > 0) console.log(`   ❌ Fallidos: ${failed}`);
    if (pending > 0) console.log(`   ⏳ Pendientes: ${pending}`);

    // Mostrar detalles de jobs en ejecución
    const runningJobs = jobs.filter(j => j.status === 'running');
    if (runningJobs.length > 0) {
      console.log('\n🔄 Jobs en Ejecución:');
      runningJobs.forEach(job => {
        console.log(`   ${job.id.substring(0, 12)}... → ${job.procedure_name} (${job.progress}%)`);
      });
    }

    // Mostrar último job completado con resultado
    const lastCompleted = jobs.find(j => j.status === 'completed' && j.result);
    if (lastCompleted) {
      console.log('\n✅ Último Job Completado:');
      console.log(`   ID: ${lastCompleted.id}`);
      console.log(`   Procedimiento: ${lastCompleted.procedure_name}`);
      console.log(`   Duración: ${lastCompleted.duration}`);
      console.log(`   Resultado: ${JSON.stringify(lastCompleted.result)}`);
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
    if (runtime === 'deno') Deno.exit(1);
    else process.exit(1);
  }
}

function formatStatus(status) {
  const statusMap = {
    'pending': '⏳ Pendiente',
    'running': '🔄 Corriendo',
    'completed': '✅ Completo',
    'failed': '❌ Fallido'
  };
  return (statusMap[status] || status).padEnd(12);
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

main();
