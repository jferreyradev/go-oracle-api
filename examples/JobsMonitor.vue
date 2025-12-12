<template>
  <div class="jobs-monitor">
    <div class="header">
      <h2>Monitor de Jobs Asíncronos</h2>
      <div class="actions">
        <button @click="refreshJobs" :disabled="loading" class="btn-refresh">
          <span v-if="loading">⟳</span>
          <span v-else>↻</span>
          Actualizar
        </button>
        <label class="auto-refresh">
          <input type="checkbox" v-model="autoRefresh" />
          Auto-refresh (5s)
        </label>
      </div>
    </div>

    <div v-if="error" class="error-banner">
      ❌ {{ error }}
    </div>

    <div class="summary">
      <div class="stat-card">
        <div class="stat-value">{{ jobs.length }}</div>
        <div class="stat-label">Total Jobs</div>
      </div>
      <div class="stat-card running">
        <div class="stat-value">{{ runningCount }}</div>
        <div class="stat-label">Ejecutando</div>
      </div>
      <div class="stat-card completed">
        <div class="stat-value">{{ completedCount }}</div>
        <div class="stat-label">Completados</div>
      </div>
      <div class="stat-card failed">
        <div class="stat-value">{{ failedCount }}</div>
        <div class="stat-label">Fallidos</div>
      </div>
    </div>

    <div v-if="loading && jobs.length === 0" class="loading">
      Cargando jobs...
    </div>

    <div v-else-if="jobs.length === 0" class="empty">
      No hay jobs registrados
    </div>

    <div v-else class="jobs-list">
      <div
        v-for="job in sortedJobs"
        :key="job.id"
        :class="['job-card', job.status]"
        @click="selectJob(job)"
      >
        <div class="job-header">
          <div class="job-title">
            <span class="job-icon">{{ getStatusIcon(job.status) }}</span>
            <span class="job-name">{{ job.procedure_name }}</span>
          </div>
          <div class="job-status">
            <span :class="['status-badge', job.status]">
              {{ getStatusLabel(job.status) }}
            </span>
          </div>
        </div>

        <div class="job-info">
          <div class="info-item">
            <span class="label">ID:</span>
            <span class="value">{{ job.id.substring(0, 12) }}...</span>
          </div>
          <div class="info-item">
            <span class="label">Inicio:</span>
            <span class="value">{{ formatDate(job.start_time) }}</span>
          </div>
          <div class="info-item" v-if="job.duration">
            <span class="label">Duración:</span>
            <span class="value">{{ job.duration }}</span>
          </div>
        </div>

        <div class="progress-bar" v-if="job.status === 'running' || job.status === 'pending'">
          <div class="progress-fill" :style="{ width: job.progress + '%' }"></div>
          <span class="progress-text">{{ job.progress }}%</span>
        </div>

        <div v-if="job.params" class="job-params">
          <summary class="params-toggle">Parámetros ({{ getParamsCount(job.params) }})</summary>
        </div>
      </div>
    </div>

    <!-- Modal de detalles -->
    <div v-if="selectedJob" class="modal-overlay" @click="selectedJob = null">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Detalles del Job</h3>
          <button @click="selectedJob = null" class="btn-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="detail-section">
            <h4>Información General</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">ID:</span>
                <code class="detail-value">{{ selectedJob.id }}</code>
              </div>
              <div class="detail-item">
                <span class="detail-label">Estado:</span>
                <span :class="['status-badge', selectedJob.status]">
                  {{ getStatusLabel(selectedJob.status) }}
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Procedimiento:</span>
                <code class="detail-value">{{ selectedJob.procedure_name }}</code>
              </div>
              <div class="detail-item">
                <span class="detail-label">Progreso:</span>
                <span class="detail-value">{{ selectedJob.progress }}%</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Fecha Inicio:</span>
                <span class="detail-value">{{ formatFullDate(selectedJob.start_time) }}</span>
              </div>
              <div class="detail-item" v-if="selectedJob.end_time">
                <span class="detail-label">Fecha Fin:</span>
                <span class="detail-value">{{ formatFullDate(selectedJob.end_time) }}</span>
              </div>
              <div class="detail-item" v-if="selectedJob.duration">
                <span class="detail-label">Duración:</span>
                <span class="detail-value">{{ selectedJob.duration }}</span>
              </div>
              <div class="detail-item" v-if="!selectedJob.end_time && selectedJob.status === 'running'">
                <span class="detail-label">Tiempo Transcurrido:</span>
                <span class="detail-value">{{ getElapsedTime(selectedJob.start_time) }}</span>
              </div>
            </div>
          </div>

          <div class="detail-section" v-if="selectedJob.params">
            <h4>Parámetros de Entrada</h4>
            <div class="params-detail">
              <div class="param-group" v-if="selectedJob.params.name">
                <span class="param-label">Nombre:</span>
                <code>{{ selectedJob.params.name }}</code>
              </div>
              <div class="param-group" v-if="selectedJob.params.isFunction !== undefined">
                <span class="param-label">Tipo:</span>
                <span class="badge">{{ selectedJob.params.isFunction ? 'Función' : 'Procedimiento' }}</span>
              </div>
              <div class="param-group" v-if="selectedJob.params.params && selectedJob.params.params.length > 0">
                <span class="param-label">Parámetros:</span>
                <div class="params-list">
                  <div v-for="(param, idx) in selectedJob.params.params" :key="idx" class="param-item">
                    <span class="param-name">{{ param.name }}</span>
                    <span v-if="param.value !== undefined" class="param-value">
                      = <code>{{ formatParamValue(param.value) }}</code>
                    </span>
                    <span v-if="param.direction" class="param-direction">{{ param.direction }}</span>
                    <span v-if="param.type" class="param-type">{{ param.type }}</span>
                  </div>
                </div>
              </div>
            </div>
            <details class="json-toggle">
              <summary>Ver JSON completo</summary>
              <pre class="code-block">{{ JSON.stringify(selectedJob.params, null, 2) }}</pre>
            </details>
          </div>

          <div class="detail-section" v-if="selectedJob.result">
            <h4>Resultado</h4>
            <div class="result-grid">
              <div v-for="(value, key) in selectedJob.result" :key="key" class="result-item">
                <span class="result-key">{{ key }}:</span>
                <code class="result-value">{{ formatResultValue(value) }}</code>
              </div>
            </div>
            <details class="json-toggle">
              <summary>Ver JSON completo</summary>
              <pre class="code-block">{{ JSON.stringify(selectedJob.result, null, 2) }}</pre>
            </details>
          </div>

          <div class="detail-section" v-if="selectedJob.error">
            <h4>Error</h4>
            <div class="error-message">{{ selectedJob.error }}</div>
          </div>

          <div class="detail-section">
            <h4>JSON Completo del Job</h4>
            <pre class="code-block">{{ JSON.stringify(selectedJob, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const API_BASE = 'http://10.6.150.91:3000'
const API_TOKEN = 'test1'

const jobs = ref([])
const loading = ref(false)
const error = ref(null)
const autoRefresh = ref(true)
const selectedJob = ref(null)
let refreshInterval = null

const sortedJobs = computed(() => {
  return [...jobs.value].sort((a, b) => {
    // Primero por estado: running > pending > completed > failed
    const statusOrder = { running: 0, pending: 1, completed: 2, failed: 3 }
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    if (statusDiff !== 0) return statusDiff
    
    // Luego por fecha de inicio (más reciente primero)
    return new Date(b.start_time) - new Date(a.start_time)
  })
})

const runningCount = computed(() => jobs.value.filter(j => j.status === 'running').length)
const completedCount = computed(() => jobs.value.filter(j => j.status === 'completed').length)
const failedCount = computed(() => jobs.value.filter(j => j.status === 'failed').length)

async function fetchJobs() {
  try {
    loading.value = true
    error.value = null

    const response = await fetch(`${API_BASE}/jobs`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    jobs.value = data.jobs || []
  } catch (err) {
    error.value = err.message
    console.error('Error fetching jobs:', err)
  } finally {
    loading.value = false
  }
}

function refreshJobs() {
  fetchJobs()
}

function selectJob(job) {
  selectedJob.value = job
}

function getStatusIcon(status) {
  const icons = {
    pending: '⏳',
    running: '🔄',
    completed: '✅',
    failed: '❌'
  }
  return icons[status] || '•'
}

function getStatusLabel(status) {
  const labels = {
    pending: 'Pendiente',
    running: 'Ejecutando',
    completed: 'Completado',
    failed: 'Fallido'
  }
  return labels[status] || status
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function getParamsCount(params) {
  if (!params || !params.params) return 0
  return params.params.length
}

function formatFullDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function getElapsedTime(startTime) {
  const start = new Date(startTime)
  const now = new Date()
  const diff = now - start
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

function formatParamValue(value) {
  if (typeof value === 'string') return `"${value}"`
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return String(value)
}

function formatResultValue(value) {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }
  return String(value)
}

watch(autoRefresh, (newValue) => {
  if (newValue) {
    refreshInterval = setInterval(fetchJobs, 5000)
  } else {
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  }
})

onMounted(() => {
  fetchJobs()
  if (autoRefresh.value) {
    refreshInterval = setInterval(fetchJobs, 5000)
  }
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped>
.jobs-monitor {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h2 {
  margin: 0;
  color: #2c3e50;
}

.actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btn-refresh {
  padding: 8px 16px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background: #2980b9;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auto-refresh {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
}

.error-banner {
  background: #fee;
  border: 1px solid #fcc;
  color: #c33;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
}

.stat-card.running { border-color: #3498db; }
.stat-card.completed { border-color: #2ecc71; }
.stat-card.failed { border-color: #e74c3c; }

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #2c3e50;
}

.stat-label {
  font-size: 14px;
  color: #7f8c8d;
  margin-top: 4px;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
  font-size: 16px;
}

.jobs-list {
  display: grid;
  gap: 16px;
}

.job-card {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.job-card:hover {
  border-color: #3498db;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.job-card.running { border-left: 4px solid #3498db; }
.job-card.completed { border-left: 4px solid #2ecc71; }
.job-card.failed { border-left: 4px solid #e74c3c; }
.job-card.pending { border-left: 4px solid #f39c12; }

.job-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.job-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
}

.job-icon {
  font-size: 20px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.running { background: #e3f2fd; color: #1976d2; }
.status-badge.completed { background: #e8f5e9; color: #388e3c; }
.status-badge.failed { background: #ffebee; color: #d32f2f; }
.status-badge.pending { background: #fff3e0; color: #f57c00; }

.job-info {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.info-item {
  font-size: 14px;
}

.info-item .label {
  color: #7f8c8d;
  margin-right: 4px;
}

.info-item .value {
  color: #2c3e50;
  font-weight: 500;
}

.progress-bar {
  position: relative;
  height: 24px;
  background: #ecf0f1;
  border-radius: 12px;
  overflow: hidden;
  margin-top: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3498db, #2ecc71);
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 600;
  color: #2c3e50;
}

.job-params {
  margin-top: 8px;
  font-size: 12px;
  color: #7f8c8d;
}

.params-toggle {
  cursor: pointer;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  color: #2c3e50;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
 detail-value {
  color: #2c3e50;
  font-weight: 500;
}

.params-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-label {
  font-size: 13px;
  color: #7f8c8d;
  font-weight: 600;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.param-name {
  font-weight: 600;
  color: #2c3e50;
}

.param-value {
  color: #7f8c8d;
}

.param-direction {
  padding: 2px 8px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.param-type {
  padding: 2px 8px;
  background: #f3e5f5;
  color: #7b1fa2;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.badge {
  padding: 4px 12px;
  background: #e8f5e9;
  color: #388e3c;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.result-item {
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-key {
  font-size: 12px;
  color: #7f8c8d;
  font-weight: 600;
}

.result-value {
  font-size: 14px;
  color: #2c3e50;
}

.json-toggle {
  margin-top: 12px;
  cursor: pointer;
}

.json-toggle summary {
  font-size: 13px;
  color: #3498db;
  cursor: pointer;
  user-select: none;
}

.json-toggle summary:hover {
  color: #2980b9;
}

. cursor: pointer;
  color: #7f8c8d;
  padding: 0;
  width: 32px;
  height: 32px;
}

.btn-close:hover {
  color: #2c3e50;
}

.modal-body {
  padding: 24px;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section h4 {
  margin: 0 0 12px 0;
  color: #2c3e50;
  font-size: 16px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: #7f8c8d;
  font-weight: 600;
  text-transform: uppercase;
}

.code-block {
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
}

.error-message {
  background: #ffebee;
  border: 1px solid #ffcdd2;
  border-radius: 6px;
  padding: 16px;
  color: #c62828;
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
}
</style>
