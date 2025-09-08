// Crea un procedimiento de prueba simple
async function crearProcedimientoPrueba() {
  const sql = `
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE OR REPLACE PROCEDURE suma_simple (
          a IN NUMBER,
          b IN NUMBER,
          resultado OUT NUMBER
        ) AS
        BEGIN
          resultado := a + b;
        END;
      ';
    END;`;
  const res = await fetch(`${API_URL}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({ query: sql })
  });
  const data = await res.json();
  console.log('Crear procedimiento suma_simple:', data);
  if (data.error) {
    console.error('Error al crear el procedimiento:', data.error);
    process.exit(1);
  }
}
// Elimina la tabla, secuencia y trigger de archivos
async function eliminarTablaArchivos() {
  const sql = `
    BEGIN
      BEGIN EXECUTE IMMEDIATE 'DROP TRIGGER archivos_bi'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -4080 THEN RAISE; END IF; END;
      BEGIN EXECUTE IMMEDIATE 'DROP TABLE archivos'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;
      BEGIN EXECUTE IMMEDIATE 'DROP SEQUENCE archivos_seq'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -2289 THEN RAISE; END IF; END;
    END;`;
  const res = await fetch(`${API_URL}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({ query: sql })
  });
  const data = await res.json();
  console.log('Eliminar tabla/trigger/secuencia archivos:', data);
}

// Crea la tabla 'archivos', la secuencia y el trigger si no existen (compatible con Oracle 11g/12c)
async function crearTablaArchivos() {
  // Crear tabla
  let sql = `
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE TABLE archivos (
          id NUMBER PRIMARY KEY,
          nombre VARCHAR2(255),
          descripcion VARCHAR2(4000),
          contenido BLOB
        )
      ';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
    END;`;
  let res = await fetch(`${API_URL}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({ query: sql })
  });
  let data = await res.json();
  console.log('Crear tabla archivos:', data);
  if (data.error) {
    console.error('Error al crear la tabla:', data.error);
    process.exit(1);
  }

  // Crear secuencia
  sql = `
    BEGIN
      EXECUTE IMMEDIATE 'CREATE SEQUENCE archivos_seq START WITH 1 INCREMENT BY 1';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
    END;`;
  res = await fetch(`${API_URL}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({ query: sql })
  });
  data = await res.json();
  console.log('Crear secuencia archivos_seq:', data);
  if (data.error) {
    console.error('Error al crear la secuencia:', data.error);
    process.exit(1);
  }

  // Crear trigger
  sql = `
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE OR REPLACE TRIGGER archivos_bi
        BEFORE INSERT ON archivos
        FOR EACH ROW
        BEGIN
          IF :NEW.id IS NULL THEN
            SELECT archivos_seq.NEXTVAL INTO :NEW.id FROM dual;
          END IF;
        END;';
    END;`;
  res = await fetch(`${API_URL}/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({ query: sql })
  });
  data = await res.json();
  console.log('Crear trigger archivos_bi:', data);
  if (data.error) {
    console.error('Error al crear el trigger:', data.error);
    process.exit(1);
  }
}
// test_todo.js
// Prueba todos los endpoints principales del microservicio Go Oracle API
// Node.js v18+ recomendado

const API_URL = 'http://localhost:8081'; // Cambia por la URL de tu microservicio
const API_TOKEN = 'demo'; // Cambia por tu token

async function testPing() {
  const res = await fetch(`${API_URL}/ping`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` }
  });
  console.log('Ping:', await res.json());
}

async function testQuery() {
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

async function testProcedure() {
  // Llama al procedimiento de prueba suma_simple
  const res = await fetch(`${API_URL}/procedure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({
      name: 'suma_simple',
      params: [
        { name: 'a', value: 5, direction: 'IN' },
        { name: 'b', value: 7, direction: 'IN' },
        { name: 'resultado', direction: 'OUT' }
      ]
    })
  });
  const result = await res.json();
  console.log('Procedure:', result);
  if(result && result.out && result.out.resultado !== undefined) {
    console.log('Resultado de la suma:', result.out.resultado);
  }
}

async function testUpload() {
  const filePath = './archivo_prueba.txt';
  let fileData;
  try {
    const fs = await import('fs/promises');
    fileData = await fs.readFile(filePath);
  } catch (e) {
    console.error('No se pudo leer el archivo. Asegúrate de que archivo_prueba.txt existe.');
    return;
  }
  const form = new FormData();
  form.append('file', new Blob([fileData]), 'archivo_prueba.txt');
  form.append('descripcion', 'Archivo de prueba desde test_todo.js');
  const res = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    body: form
  });
  console.log('Upload:', await res.json());
}

async function testLogs() {
  const res = await fetch(`${API_URL}/logs`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` }
  });
  const text = await res.text();
  console.log('Logs (primeras 20 líneas):\n', text.split('\n').slice(0, 20).join('\n'));
}




async function main() {
  await crearTablaArchivos();
  await crearProcedimientoPrueba();
  await testPing();
  await testQuery();
  await testProcedure();
  await testUpload();
  await testLogs();
  await eliminarTablaArchivos();
}

main().catch(console.error);
