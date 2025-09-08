// ejemplo-cliente.ts
// Ejemplo de uso de la API Go Oracle desde TypeScript/JavaScript
// Compatible con Bun, Deno y Node.js (v18+)

const API_URL = 'http://localhost:8080'; // Cambia por la URL de tu microservicio
const API_TOKEN = 'TU_TOKEN_AQUI'; // Cambia por tu token

async function ping() {
  const res = await fetch(`${API_URL}/ping`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` }
  });
  console.log('Ping:', await res.json());
}

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

async function upload() {
  // Usa Bun, Deno o Node.js para leer un archivo
  const filePath = './archivo_prueba.txt';
  let fileData;
  if (typeof Bun !== 'undefined') {
    fileData = await Bun.file(filePath).arrayBuffer();
  } else if (typeof Deno !== 'undefined') {
    fileData = await Deno.readFile(filePath);
  } else {
    fileData = await import('fs').then(fs => fs.promises.readFile(filePath));
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

async function main() {
  await ping();
  await query();
  await procedure();
  await upload();
}

main().catch(console.error);
