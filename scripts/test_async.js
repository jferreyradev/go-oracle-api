// Script de prueba para procedimientos asíncronos
// Compatible con: Node.js 18+, Deno, Bun

const API_URL = 'http://10.6.150.91:3000';
const API_TOKEN = 'test1';

// Detectar runtime
const runtime = typeof Deno !== 'undefined' ? 'deno' : 
               typeof Bun !== 'undefined' ? 'bun' : 'node';

// Función auxiliar para esperar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Verificar que el procedimiento suma_simple existe
async function verificarProcedimiento() {
  console.log('\n=== Verificando procedimiento suma_simple ===');
  // Solo verificamos que la API responde
  const res = await fetch(`${API_URL}/ping`, {
    headers: { 'Authorization': `Bearer ${API_TOKEN}` }
  });
  
  const data = await res.json();
  if (data.status === 'ok') {
    console.log('✅ API respondiendo correctamente');
    console.log('ℹ️  Usando procedimiento: suma_simple(a, b, resultado OUT)');
  } else {
    console.error('❌ API no responde');
    if (runtime === 'deno') Deno.exit(1);
    else process.exit(1);
  }
}

// Prueba 1: Ejecutar procedimiento asíncrono básico
async function test1_basico() {
  console.log('\n=== Test 1: Ejecución Asíncrona Básica ===');
  
  // Iniciar procedimiento suma_simple
  console.log('Iniciando suma_simple(5 + 7)...');
  const response = await fetch(`${API_URL}/procedure/async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({
      name: 'suma_simple',
      params: [
        { name: 'a', value: 5 },
        { name: 'b', value: 7 },
        { name: 'resultado', direction: 'OUT' }
      ]
    })
  });
  
  if (response.status !== 202) {
    console.error('❌ Error:', response.status);
    return;
  }
  
  const { job_id, message } = await response.json();
  console.log('✅ Job iniciado:', job_id);
  console.log('   Mensaje:', message);
  
  // Consultar estado cada 2 segundos
  console.log('\nMonitoreando progreso...');
  while (true) {
    await sleep(2000);
    
    const statusRes = await fetch(`${API_URL}/jobs/${job_id}`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    
    const job = await statusRes.json();
    
    const emoji = {
      'pending': '⏳',
      'running': '🔄',
      'completed': '✅',
      'failed': '❌'
    }[job.status];
    
    console.log(`${emoji} Estado: ${job.status.padEnd(10)} Progreso: ${job.progress}%`);
    
    if (job.status === 'completed') {
      console.log('\n🎉 Completado en', job.duration);
      console.log('   Resultado:', job.result);
      break;
    } else if (job.status === 'failed') {
      console.error('\n❌ Falló:', job.error);
      break;
    }
  }
}

// Prueba 2: Múltiples jobs en paralelo
async function test2_paralelo() {
  console.log('\n=== Test 2: Múltiples Jobs en Paralelo ===');
  
  const jobs = [];
  const valores = [[5, 3], [10, 20], [15, 25], [100, 200]]; // pares [a, b]
  
  // Lanzar varios jobs
  console.log('Lanzando 4 sumas simultáneas...');
  for (const [a, b] of valores) {
    const response = await fetch(`${API_URL}/procedure/async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`
      },
      body: JSON.stringify({
        name: 'suma_simple',
        params: [
          { name: 'a', value: a },
          { name: 'b', value: b },
          { name: 'resultado', direction: 'OUT' }
        ]
      })
    });
    
    const { job_id } = await response.json();
    jobs.push({ id: job_id, a, b });
    console.log(`  ✓ Job ${jobs.length}: ${a} + ${b} (${job_id.substring(0, 8)}...)`);
  }
  
  // Monitorear todos
  console.log('\nMonitoreando todos los jobs...\n');
  while (true) {
    await sleep(2000);
    
    // Obtener lista de todos los jobs
    const listRes = await fetch(`${API_URL}/jobs`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    
    const { jobs: allJobs } = await listRes.json();
    
    // Filtrar solo nuestros jobs
    const misJobs = allJobs.filter(j => jobs.some(mj => mj.id === j.id));
    
    console.clear();
    console.log('=== Estado de Jobs Paralelos ===\n');
    
    let allDone = true;
    misJobs.forEach((job, idx) => {
      const emoji = {
        'pending': '⏳',
        'running': '🔄',
        'completed': '✅',
        'failed': '❌'
      }[job.status];
      
      console.log(`${emoji} Job ${idx + 1}: ${job.status.padEnd(10)} ${job.progress}%`);
      if (job.duration) console.log(`   Duración: ${job.duration}`);
      if (job.result) console.log(`   Resultado: ${job.result.resultado}`);
      console.log();
      
      if (job.status === 'running' || job.status === 'pending') {
        allDone = false;
      }
    });
    
    if (allDone) {
      console.log('🎉 Todos los jobs finalizaron!');
      break;
    }
  }
}

// Prueba 3: Manejo de errores
async function test3_error() {
  console.log('\n=== Test 3: Manejo de Errores ===');
  
  // Intentar ejecutar un procedimiento que no existe
  console.log('Intentando ejecutar procedimiento inexistente...');
  const response = await fetch(`${API_URL}/procedure/async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({
      name: 'procedimiento_que_no_existe',
      params: []
    })
  });
  
  const { job_id } = await response.json();
  console.log('Job ID:', job_id);
  
  // Esperar un poco y verificar
  await sleep(3000);
  
  const statusRes = await fetch(`${API_URL}/jobs/${job_id}`, {
    headers: { 'Authorization': `Bearer ${API_TOKEN}` }
  });
  
  const job = await statusRes.json();
  console.log('\nEstado:', job.status);
  if (job.error) {
    console.log('❌ Error esperado recibido:', job.error.substring(0, 100));
    console.log('✅ Test de error pasó correctamente');
  }
}

// Prueba 4: Listar todos los jobs
async function test4_listar() {
  console.log('\n=== Test 4: Listar Todos los Jobs ===');
  
  const response = await fetch(`${API_URL}/jobs`, {
    headers: { 'Authorization': `Bearer ${API_TOKEN}` }
  });
  
  const { total, jobs } = await response.json();
  
  console.log(`\nTotal de jobs: ${total}\n`);
  
  if (jobs.length === 0) {
    console.log('No hay jobs registrados.');
    return;
  }
  
  jobs.forEach((job, idx) => {
    const emoji = {
      'pending': '⏳',
      'running': '🔄',
      'completed': '✅',
      'failed': '❌'
    }[job.status];
    
    console.log(`${emoji} Job ${idx + 1}: ${job.procedure_name}`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Estado: ${job.status}`);
    console.log(`   Inicio: ${new Date(job.start_time).toLocaleString()}`);
    if (job.end_time) {
      console.log(`   Fin: ${new Date(job.end_time).toLocaleString()}`);
      console.log(`   Duración: ${job.duration}`);
    }
    console.log();
  });
}

// Ejecutar todas las pruebas
async function main() {
  console.log('='.repeat(60));
  console.log('  PRUEBAS DE PROCEDIMIENTOS ASÍNCRONOS');
  console.log('='.repeat(60));
  
  try {
    // Verificar procedimiento
    await verificarProcedimiento();
    
    // Ejecutar pruebas
    await test1_basico();
    await sleep(2000);
    
    await test2_paralelo();
    await sleep(2000);
    
    await test3_error();
    await sleep(2000);
    
    await test4_listar();
    
    console.log('\n' + '='.repeat(60));
    console.log('  ✅ TODAS LAS PRUEBAS COMPLETADAS');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n❌ Error en las pruebas:', error);
    if (runtime === 'deno') Deno.exit(1);
    else process.exit(1);
  }
}

// Ejecutar si se llama directamente
const isMainModule = runtime === 'deno' 
  ? import.meta.main 
  : import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch(console.error);
}

export { main };
