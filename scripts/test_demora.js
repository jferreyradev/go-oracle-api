// Script para crear y probar procedimiento con demora simulada
// Compatible con: Node.js 18+, Deno, Bun

const API_URL = 'http://10.6.150.91:3000';
const API_TOKEN = 'test1';

// Detectar runtime
const runtime = typeof Deno !== 'undefined' ? 'deno' : 
               typeof Bun !== 'undefined' ? 'bun' : 'node';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Crear procedimiento que simula demora con loops
async function crearProcedimientoConDemora() {
  console.log('\n=== Creando procedimiento con demora simulada ===');
  
  const sql = `
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE OR REPLACE PROCEDURE proceso_con_demora (
          segundos_simular IN NUMBER,
          iteraciones_completadas OUT NUMBER
        ) AS
          v_iteraciones NUMBER := 0;
          v_total_loops NUMBER;
          v_contador NUMBER;
        BEGIN
          -- Calcular loops necesarios (aprox 100 millones por segundo)
          v_total_loops := segundos_simular * 100000000;
          
          -- Loop que simula procesamiento pesado
          FOR i IN 1..segundos_simular LOOP
            -- Loop interno para simular trabajo
            FOR j IN 1..100000000 LOOP
              v_contador := j * 2;  -- Operación simple
              
              -- Cada 10 millones, incrementar iteraciones
              IF MOD(j, 10000000) = 0 THEN
                v_iteraciones := v_iteraciones + 1;
              END IF;
            END LOOP;
          END LOOP;
          
          iteraciones_completadas := v_iteraciones;
        END;
      ';
    END;`;
  
  const res = await fetch(`${API_URL}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({ query: sql })
  });
  
  const data = await res.json();
  if (data.error) {
    console.error('❌ Error:', data.error);
    if (!data.error.includes('ORA-00955')) {
      if (runtime === 'deno') Deno.exit(1);
      else process.exit(1);
    }
  } else {
    console.log('✅ Procedimiento proceso_con_demora creado');
  }
}

// Probar el procedimiento de forma síncrona primero
async function probarSincrono() {
  console.log('\n=== Prueba Síncrona (para comparar) ===');
  console.log('Ejecutando proceso_con_demora(2 segundos) síncronamente...');
  
  const inicio = Date.now();
  
  const res = await fetch(`${API_URL}/procedure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({
      name: 'proceso_con_demora',
      params: [
        { name: 'segundos_simular', value: 2 },
        { name: 'iteraciones_completadas', direction: 'OUT', type: 'number' }
      ]
    })
  });
  
  const data = await res.json();
  const duracion = ((Date.now() - inicio) / 1000).toFixed(2);
  
  console.log(`✅ Completado en ${duracion}s`);
  console.log(`   Iteraciones: ${data.out?.iteraciones_completadas || 'N/A'}`);
}

// Probar de forma asíncrona con monitoreo
async function probarAsincrono() {
  console.log('\n=== Prueba Asíncrona (con monitoreo) ===');
  console.log('Lanzando proceso_con_demora(5 segundos) en segundo plano...');
  
  const inicio = Date.now();
  
  // Iniciar job
  const res = await fetch(`${API_URL}/procedure/async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({
      name: 'proceso_con_demora',
      params: [
        { name: 'segundos_simular', value: 5 },
        { name: 'iteraciones_completadas', direction: 'OUT', type: 'number' }
      ]
    })
  });
  
  const { job_id, message } = await res.json();
  console.log(`✅ Job iniciado: ${job_id}`);
  console.log(`   ${message}\n`);
  
  // Monitorear cada 1 segundo
  console.log('⏱️  Monitoreando progreso cada 1 segundo...\n');
  console.log('Tiempo | Estado    | Progreso | Detalles');
  console.log('-------|-----------|----------|----------');
  
  let completado = false;
  while (!completado) {
    await sleep(1000);
    
    const statusRes = await fetch(`${API_URL}/jobs/${job_id}`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    
    const job = await statusRes.json();
    const transcurrido = ((Date.now() - inicio) / 1000).toFixed(1);
    
    const emoji = {
      'pending': '⏳',
      'running': '🔄',
      'completed': '✅',
      'failed': '❌'
    }[job.status];
    
    let detalles = '';
    if (job.status === 'completed') {
      detalles = `Iteraciones: ${job.result?.iteraciones_completadas || 'N/A'}`;
      completado = true;
    } else if (job.status === 'failed') {
      detalles = `Error: ${job.error.substring(0, 30)}...`;
      completado = true;
    }
    
    console.log(`${transcurrido.padStart(4)}s  | ${emoji} ${job.status.padEnd(9)} | ${job.progress.toString().padStart(3)}%      | ${detalles}`);
  }
  
  console.log('\n🎉 Proceso completado!');
}

// Probar múltiples jobs con diferentes duraciones
async function probarMultiples() {
  console.log('\n=== Prueba con Múltiples Jobs de Diferente Duración ===');
  
  const duraciones = [3, 5, 2, 7];
  const jobs = [];
  
  console.log('Lanzando 4 procesos simultáneos...');
  for (const segundos of duraciones) {
    const res = await fetch(`${API_URL}/procedure/async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`
      },
      body: JSON.stringify({
        name: 'proceso_con_demora',
        params: [
          { name: 'segundos_simular', value: segundos },
          { name: 'iteraciones_completadas', direction: 'OUT', type: 'number' }
        ]
      })
    });
    
    const { job_id } = await res.json();
    jobs.push({ id: job_id, segundos });
    console.log(`  ✓ Job ${jobs.length}: ${segundos}s (${job_id.substring(0, 8)}...)`);
  }
  
  console.log('\n⏱️  Monitoreando todos los jobs cada 2 segundos...\n');
  
  let todosCompletados = false;
  let iteracion = 0;
  
  while (!todosCompletados) {
    if (iteracion > 0) await sleep(2000);
    
    const listRes = await fetch(`${API_URL}/jobs/`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    
    const { jobs: allJobs } = await listRes.json();
    const misJobs = allJobs.filter(j => jobs.some(mj => mj.id === j.id));
    
    // Limpiar pantalla de forma simple
    if (iteracion > 0) console.log('\n' + '─'.repeat(70));
    
    console.log(`Iteración ${iteracion + 1}:`);
    console.log('Job | Duración | Estado    | Progreso | Tiempo');
    console.log('----|----------|-----------|----------|-------');
    
    todosCompletados = true;
    misJobs.forEach((job, idx) => {
      const jobInfo = jobs.find(j => j.id === job.id);
      const emoji = {
        'pending': '⏳',
        'running': '🔄',
        'completed': '✅',
        'failed': '❌'
      }[job.status];
      
      const tiempo = job.duration || 'En proceso...';
      
      console.log(`${(idx + 1).toString().padStart(3)} | ${jobInfo.segundos}s       | ${emoji} ${job.status.padEnd(9)} | ${job.progress.toString().padStart(3)}%      | ${tiempo}`);
      
      if (job.status === 'running' || job.status === 'pending') {
        todosCompletados = false;
      }
    });
    
    iteracion++;
  }
  
  console.log('\n🎉 Todos los jobs completados!');
  console.log('\nResultados finales:');
  
  const listRes = await fetch(`${API_URL}/jobs/`, {
    headers: { 'Authorization': `Bearer ${API_TOKEN}` }
  });
  
  const { jobs: allJobs } = await listRes.json();
  const misJobs = allJobs.filter(j => jobs.some(mj => mj.id === j.id));
  
  misJobs.forEach((job, idx) => {
    const jobInfo = jobs.find(j => j.id === job.id);
    console.log(`\nJob ${idx + 1} (${jobInfo.segundos}s solicitados):`);
    console.log(`  - Duración real: ${job.duration}`);
    console.log(`  - Iteraciones: ${job.result?.iteraciones_completadas || 'N/A'}`);
  });
}

// Función principal
async function main() {
  console.log('═'.repeat(70));
  console.log('  PRUEBA DE PROCEDIMIENTO CON DEMORA Y MONITOREO EN TIEMPO REAL');
  console.log('═'.repeat(70));
  
  try {
    // Crear el procedimiento
    await crearProcedimientoConDemora();
    await sleep(1000);
    
    // Probar síncronamente primero
    await probarSincrono();
    await sleep(2000);
    
    // Probar asíncronamente con monitoreo
    await probarAsincrono();
    await sleep(2000);
    
    // Probar múltiples en paralelo
    await probarMultiples();
    
    console.log('\n' + '═'.repeat(70));
    console.log('  ✅ TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE');
    console.log('═'.repeat(70));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (runtime === 'deno') Deno.exit(1);
    else process.exit(1);
  }
}

// Ejecutar
const isMainModule = runtime === 'deno' 
  ? import.meta.main 
  : import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch(console.error);
}

export { main };
