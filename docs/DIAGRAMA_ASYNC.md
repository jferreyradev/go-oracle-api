# Diagrama de Flujo: Procedimientos Asíncronos

## Arquitectura General

```
┌─────────────┐
│   Cliente   │ (Browser/App)
└──────┬──────┘
       │
       │ POST /procedure/async
       │ {name: "PROC", params: [...]}
       ▼
┌──────────────────────────────────────┐
│      Go Oracle API Server            │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  asyncProcedureHandler          │ │
│  │  1. Crear AsyncJob              │ │
│  │  2. Responder inmediatamente    │ │
│  │  3. Lanzar goroutine            │ │
│  └────────────────────────────────┘ │
│                 │                    │
│                 ▼                    │
│  ┌────────────────────────────────┐ │
│  │      Goroutine en bg           │ │
│  │  - Preparar parámetros         │ │
│  │  - Ejecutar db.Prepare/Exec    │ │
│  │  - Actualizar progreso         │ │
│  │  - Guardar resultado           │ │
│  └────────────────────────────────┘ │
│                 │                    │
│                 ▼                    │
│  ┌────────────────────────────────┐ │
│  │      JobManager                │ │
│  │  map[jobID]*AsyncJob           │ │
│  │  - CreateJob()                 │ │
│  │  - GetJob()                    │ │
│  │  - UpdateJob()                 │ │
│  │  - CleanupOldJobs()            │ │
│  └────────────────────────────────┘ │
└──────────────────────────────────────┘
       ▲
       │ GET /jobs/{job_id}
       │
┌──────┴──────┐
│   Cliente   │ (Polling cada N segundos)
└─────────────┘
```

## Flujo de Ejecución Detallado

```
CLIENTE                     API SERVER                    ORACLE DB
   │                            │                             │
   │  POST /procedure/async     │                             │
   ├───────────────────────────>│                             │
   │                            │                             │
   │                            │ 1. job = CreateJob()        │
   │                            ├─────────────┐               │
   │                            │             │               │
   │  202 Accepted              │<────────────┘               │
   │  {job_id: "abc123..."}     │                             │
   │<───────────────────────────┤                             │
   │                            │                             │
   │                            │ 2. go func() {              │
   │                            │      Prepare SQL            │
   │                            ├────────────────────────────>│
   │                            │                             │
   │                            │      Execute                │
   │                            ├────────────────────────────>│
   │  GET /jobs/abc123          │                             │
   ├───────────────────────────>│                             │
   │                            │                             │
   │  {status: "running",       │                             │
   │   progress: 50}            │<─────────────┐              │
   │<───────────────────────────┤              │              │
   │                            │   UpdateJob() │              │
   │                            │              │              │
   │                            │   ... sigue ejecutando ...  │
   │                            │                             │
   │  GET /jobs/abc123          │                             │
   ├───────────────────────────>│                             │
   │                            │                             │
   │  {status: "running",       │      Fetch OUT params       │
   │   progress: 80}            │<────────────────────────────┤
   │<───────────────────────────┤                             │
   │                            │                             │
   │                            │ 3. UpdateJob(completed)     │
   │                            ├─────────────┐               │
   │                            │             │               │
   │  GET /jobs/abc123          │<────────────┘               │
   ├───────────────────────────>│                             │
   │                            │                             │
   │  {status: "completed",     │                             │
   │   result: {...}}           │                             │
   │<───────────────────────────┤                             │
   │                            │                             │
   │         } // fin go func() │                             │
   │                            │                             │
```

## Estados del Job

```
       ┌─────────┐
       │ PENDING │ progress: 0%
       └────┬────┘
            │ Goroutine inicia
            ▼
       ┌─────────┐
       │ RUNNING │ progress: 10-80%
       └────┬────┘
            │
     ┌──────┴──────┐
     │             │
Success│             │Error
     │             │
     ▼             ▼
┌──────────┐  ┌────────┐
│COMPLETED │  │ FAILED │ progress: 100%
└──────────┘  └────────┘
```

## Progreso Simulado

```
Job Lifecycle:
─────────────────────────────────────────────────>
0%   10%      30%     50%        80%        100%
│     │        │       │          │          │
│     │        │       │          │          │
Create│     Prepare  Execute   Fetch     Complete
      │        │       │       Results
      │        │       │          │
   Start    Build    Running   Collect
   Job      SQL      Query     OUT params
```

## Ejemplo con 3 Jobs Paralelos

```
Time ─────────────────────────────────────────────>
     0s    5s    10s   15s   20s   25s   30s

Job1 ■■■■■■■■■■■■■■■■■■■■■■■■■■■■ (Complete)
     [5s execution]

Job2 ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ (Complete)
     [8s execution]

Job3 ■■■■■■■■■ (Complete)
     [3s execution]

Job4 ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ (Complete)
     [12s execution]

Todos iniciados simultáneamente, cada uno completa
en su propio tiempo sin bloquear a los demás.
```

## Memoria y JobManager

```
JobManager
└── jobs: map[string]*AsyncJob
    ├── "a3f5e8d9..." → AsyncJob{status: completed, result: {...}}
    ├── "b4f6e9d0..." → AsyncJob{status: running, progress: 45}
    ├── "c5f7e0d1..." → AsyncJob{status: pending, progress: 0}
    └── ...

Limpieza automática cada 1 hora:
  - Si job.end_time < now - 24h → delete(jobs, id)
```

## Patrón de Polling del Cliente

```javascript
// Polling adaptativo
let intervalo = 5000; // Empezar con 5s

while (job.status === 'running') {
  await sleep(intervalo);
  
  job = await checkStatus(jobId);
  
  // Ajustar intervalo según progreso
  if (job.progress < 30) {
    intervalo = 5000;  // Inicio lento
  } else if (job.progress < 70) {
    intervalo = 10000; // Medio más lento
  } else {
    intervalo = 3000;  // Final más rápido
  }
}
```

## Thread Safety

```
                ┌──────────────┐
   Cliente 1 ──>│              │
                │  JobManager  │<─── Goroutine 1 (UpdateJob)
   Cliente 2 ──>│   + Mutex    │
                │              │<─── Goroutine 2 (UpdateJob)
   Cliente 3 ──>│              │
                └──────────────┘<─── Cleanup Task

Todas las operaciones están protegidas por sync.RWMutex:
- GetJob()       → RLock (lectura, múltiples simultáneos)
- GetAllJobs()   → RLock (lectura, múltiples simultáneos)
- CreateJob()    → Lock  (escritura, exclusivo)
- UpdateJob()    → Lock  (escritura, exclusivo)
- CleanupOldJobs() → Lock  (escritura, exclusivo)
```

## Comparación Visual: Síncrono vs Asíncrono

### Síncrono (/procedure)
```
Request ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━> Response
       [────────────────────────────]
        Bloqueado esperando 30s
```

### Asíncrono (/procedure/async)
```
Request ━> Response (job_id)
           [Usuario puede hacer otras cosas]
           
           Poll cada 10s:
           ┌──> Check status
           │    [running: 30%]
           │    
           ├──> Check status  
           │    [running: 60%]
           │
           └──> Check status
                [completed: 100%] ✅
```

## Ventaja de Múltiples Instancias

```
Instancia 1 (Puerto 8081)        Instancia 2 (Puerto 8082)
─────────────────────             ─────────────────────
JobManager                        JobManager
├── job_abc: running              ├── job_xyz: completed
├── job_def: completed            └── job_123: running
└── job_ghi: failed               

Cada instancia mantiene sus propios jobs.
Los jobs NO se comparten entre instancias.
```

---

Este diagrama muestra cómo funciona internamente el sistema de jobs asíncronos.
