// ejemplo-cliente.js
// Ejemplo de uso de la API Go Oracle desde JavaScript puro
// Compatible con Node.js v18+, Bun y Deno (ajusta la lectura de archivos según el entorno)

const API_URL = 'http://localhost:8080'; // Cambia por la URL de tu microservicio
const API_TOKEN = 'TU_TOKEN_AQUI'; // Cambia por tu token

// --- Llamada a /ping ---
async function ping() {
  const res = await fetch(`${API_URL}/ping`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` }
  });
  console.log('Ping:', await res.json());
}

// --- Llamada a /exec (consulta SQL) ---
async function query() {
  const res = await fetch(`${API_URL}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({ query: 'SELECT sysdate FROM dual' })
  });
  console.log('Query:', await res.json());
}

// --- Llamada a /procedure (procedimiento almacenado) ---
async function procedure() {
  const res = await fetch(`${API_URL}/procedure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({
      name: 'NOMBRE_PROCEDIMIENTO',
      params: [
        { name: 'param1', value: 'valor', direction: 'IN' },
        { name: 'param2', direction: 'OUT' }
      ]
    })
  });
  console.log('Procedure:', await res.json());
}

// --- Llamada a /upload (subida de archivo como BLOB) ---
async function upload() {
  // Cambia la ruta al archivo que quieras subir
  const filePath = './archivo_prueba.txt';
  let fileData;
  // Node.js v18+ (usa fs/promises y Blob)
  try {
    const fs = await import('fs/promises');
    fileData = await fs.readFile(filePath);
  } catch (e) {
    console.error('No se pudo leer el archivo. Ajusta esta sección según tu entorno.');
    return;
  }
  const form = new FormData();
  form.append('file', new Blob([fileData]), 'archivo_prueba.txt');
  form.append('descripcion', 'Archivo de prueba desde script');
  const res = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    body: form
  });
  console.log('Upload:', await res.json());
}

// --- Ejecutar todas las pruebas ---
async function main() {
  await ping(); // Prueba de salud
  await query(); // Prueba de consulta SQL
  await procedure(); // Prueba de procedimiento almacenado
  await upload(); // Prueba de subida de archivo
}

main().catch(console.error);
