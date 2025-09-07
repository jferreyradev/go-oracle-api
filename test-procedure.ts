// test-procedure.ts
// Ejecuta una petición POST al endpoint /procedure para probar el soporte de procedimientos almacenados

const url = 'http://localhost:8080/procedure';
const token = 'TU_TOKEN_AQUI'; // Reemplaza por tu API_TOKEN si es necesario

const body = {
  name: 'prueba_api',
  params: [
    { name: 'p_nombre', value: 'Mundo', direction: 'IN' },
    { name: 'p_result', direction: 'OUT' }
  ]
};

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};

async function main() {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log('Respuesta:', data);
}

main().catch(console.error);
