// Test para verificar procedimientos/funciones standalone (sin paquete)

const API_URL = 'http://10.6.46.114:3013';
const API_TOKEN = 'test1';

async function makeRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`,
                ...options.headers
            }
        });

        const data = await response.json();
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Request: ${options.method || 'GET'} ${endpoint}`);
        console.log(`Status: ${response.status}`);
        console.log(`Response:`);
        console.log(JSON.stringify(data, null, 2));
        
        return { success: response.ok, data };
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function testStandaloneProcedure() {
    console.log('\n🧪 Test 1: Procedimiento Standalone (PROC_TEST)');
    return await makeRequest('/procedure', {
        method: 'POST',
        body: JSON.stringify({
            name: 'PROC_TEST',
            params: [
                { name: 'p_input', value: 'Test desde Node.js', direction: 'IN', type: 'STRING' },
                { name: 'p_output', direction: 'OUT', type: 'STRING' }
            ]
        })
    });
}

async function testStandaloneFunction() {
    console.log('\n🧪 Test 2: Función Standalone (FUNC_TEST_SUMA)');
    return await makeRequest('/procedure', {
        method: 'POST',
        body: JSON.stringify({
            name: 'FUNC_TEST_SUMA',
            isFunction: true,
            params: [
                { name: 'resultado', direction: 'OUT', type: 'number' },
                { name: 'p_num1', value: 10, direction: 'IN', type: 'number' },
                { name: 'p_num2', value: 20, direction: 'IN', type: 'number' }
            ]
        })
    });
}

async function testStandaloneFunctionWithSchema() {
    console.log('\n🧪 Test 3: Función Standalone con nombre de esquema');
    
    // Primero obtener el usuario actual
    const userResult = await makeRequest('/query', {
        method: 'POST',
        body: JSON.stringify({
            query: 'SELECT USER FROM DUAL'
        })
    });
    
    if (!userResult.success) {
        console.log('❌ No se pudo obtener el nombre del esquema');
        return { success: false };
    }
    
    const schema = userResult.data.results[0].USER;
    console.log(`📌 Esquema detectado: ${schema}`);
    
    return await makeRequest('/procedure', {
        method: 'POST',
        body: JSON.stringify({
            name: `${schema}.FUNC_TEST_SUMA`,
            isFunction: true,
            params: [
                { name: 'resultado', direction: 'OUT', type: 'number' },
                { name: 'p_num1', value: 15, direction: 'IN', type: 'number' },
                { name: 'p_num2', value: 25, direction: 'IN', type: 'number' }
            ]
        })
    });
}

async function testVerifyObjectsExist() {
    console.log('\n🧪 Test 4: Verificar que los objetos existen en la base de datos');
    return await makeRequest('/query', {
        method: 'POST',
        body: JSON.stringify({
            query: `
                SELECT object_name, object_type, status
                FROM user_objects
                WHERE object_name IN ('PROC_TEST', 'FUNC_TEST_SUMA', 'FUNC_TEST_SALUDO')
                ORDER BY object_name
            `
        })
    });
}

async function runAllTests() {
    console.log('🚀 Iniciando tests de procedimientos/funciones standalone\n');
    
    // Verificar que existen los objetos
    const verifyResult = await testVerifyObjectsExist();
    if (!verifyResult.success || !verifyResult.data.results || verifyResult.data.results.length === 0) {
        console.log('\n❌ ERROR: Los procedimientos/funciones no existen en la base de datos');
        console.log('   Ejecuta los scripts SQL primero:');
        console.log('   - sql/create_test_procedures.sql');
        console.log('   - sql/create_test_functions.sql');
        return;
    }
    
    console.log('\n✅ Objetos encontrados en la base de datos');
    
    // Test procedimiento
    const procResult = await testStandaloneProcedure();
    
    // Test función
    const funcResult = await testStandaloneFunction();
    
    // Test con esquema explícito
    const schemaResult = await testStandaloneFunctionWithSchema();
    
    // Resumen
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE TESTS:');
    console.log('='.repeat(60));
    console.log(`Procedimiento standalone: ${procResult.success ? '✅ OK' : '❌ FAIL'}`);
    console.log(`Función standalone:       ${funcResult.success ? '✅ OK' : '❌ FAIL'}`);
    console.log(`Función con esquema:      ${schemaResult.success ? '✅ OK' : '❌ FAIL'}`);
    
    if (!procResult.success || !funcResult.success) {
        console.log('\n❌ PROBLEMA DETECTADO:');
        console.log('Los procedimientos/funciones standalone no se están ejecutando correctamente.');
        console.log('\nPosibles causas:');
        console.log('1. El driver Oracle no está manejando correctamente los objetos standalone');
        console.log('2. Falta especificar el esquema del usuario');
        console.log('3. Problema con los permisos de ejecución');
    }
}

// Ejecutar tests
runAllTests().catch(error => {
    console.error('❌ Error fatal:', error);
});
