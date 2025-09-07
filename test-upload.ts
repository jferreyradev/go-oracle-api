// test-upload.ts
// Prueba de carga de archivos al endpoint /upload usando fetch (compatible con Bun, Deno, Node.js v18+)

const url = 'http://localhost:8080/upload';
const token = 'TU_TOKEN_AQUI'; // Reemplaza por tu API_TOKEN si es necesario
const filePath = './archivo_prueba.txt'; // Cambia por el archivo que quieras subir
const descripcion = 'Archivo de prueba subido desde script TypeScript';

async function main() {
  // Leer archivo como binario
  const fileData = await Bun.file(filePath).arrayBuffer(); // Para Bun
  // Para Deno: const fileData = await Deno.readFile(filePath);
  // Para Node.js: const fileData = await import('fs').then(fs => fs.promises.readFile(filePath));

  // Crear FormData
  const form = new FormData();
  form.append('file', new Blob([fileData]), filePath.split('/').pop());
  form.append('descripcion', descripcion);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: form
  });
  const data = await res.json();
  console.log('Respuesta:', data);
}

main().catch(console.error);
