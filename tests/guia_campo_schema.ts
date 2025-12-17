// Guía completa: Cuándo usar y NO usar el campo 'schema'

const BACKEND_URL = "http://10.6.46.114:3013";
const TOKEN = "test1";

async function testSchemaUsage() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║       GUÍA: CUÁNDO USAR EL CAMPO 'schema'                  ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    // Verificar estructura de la base de datos
    console.log("📊 ESTRUCTURA DE TU BASE DE DATOS:\n");

    // 1. Usuario actual
    const userRes = await fetch(`${BACKEND_URL}/query`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "SELECT USER FROM DUAL" })
    });
    const userData = await userRes.json();
    console.log("1. Usuario conectado:", userData.results[0].USER);

    // 2. Paquetes en el esquema actual
    const pkgRes = await fetch(`${BACKEND_URL}/query`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ 
            query: "SELECT object_name FROM user_objects WHERE object_type = 'PACKAGE' ORDER BY object_name" 
        })
    });
    const pkgData = await pkgRes.json();
    console.log("\n2. Paquetes en tu esquema:");
    if (pkgData.results && pkgData.results.length > 0) {
        pkgData.results.slice(0, 5).forEach(p => console.log("   •", p.OBJECT_NAME));
        if (pkgData.results.length > 5) console.log(`   ... y ${pkgData.results.length - 5} más`);
    }

    // 3. Funciones standalone
    const funcRes = await fetch(`${BACKEND_URL}/query`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ 
            query: `SELECT owner, object_name 
                    FROM all_objects 
                    WHERE object_type = 'FUNCTION' 
                    AND object_name = 'EXISTE_PROC_CAB'` 
        })
    });
    const funcData = await funcRes.json();
    console.log("\n3. Función EXISTE_PROC_CAB está en el esquema:", 
                funcData.results && funcData.results[0] ? funcData.results[0].OWNER : "N/A");

    // 4. Sinónimos
    const synRes = await fetch(`${BACKEND_URL}/query`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ 
            query: "SELECT synonym_name, table_owner, table_name FROM user_synonyms ORDER BY synonym_name" 
        })
    });
    const synData = await synRes.json();
    console.log("\n4. Sinónimos disponibles:");
    if (synData.results && synData.results.length > 0) {
        synData.results.slice(0, 5).forEach(s => 
            console.log(`   • ${s.SYNONYM_NAME} → ${s.TABLE_OWNER}.${s.TABLE_NAME}`)
        );
        if (synData.results.length > 5) console.log(`   ... y ${synData.results.length - 5} más`);
    } else {
        console.log("   (ninguno)");
    }

    console.log("\n" + "═".repeat(60));
    console.log("\n📚 REGLAS PARA USAR EL CAMPO 'schema':\n");

    console.log("❌ NO USAR 'schema' cuando:");
    console.log("   1. La función/procedimiento está en tu esquema actual (USUARIO)");
    console.log("   2. Existe un sinónimo que apunta al objeto");
    console.log("   3. Hay un PAQUETE con el mismo nombre que el esquema destino");
    console.log("      Ejemplo: Paquete WORKFLOW vs Esquema WORKFLOW → CONFLICTO\n");

    console.log("✅ USAR 'schema' cuando:");
    console.log("   1. El objeto está en OTRO esquema (no en USUARIO)");
    console.log("   2. NO hay paquete con ese nombre en tu esquema actual");
    console.log("   3. Tienes permisos EXECUTE sobre ese objeto");
    console.log("   4. NO existe sinónimo (o prefieres ser explícito)\n");

    console.log("═".repeat(60));
    console.log("\n📝 EJEMPLOS PRÁCTICOS:\n");

    const examples = [
        {
            caso: "1. Función con sinónimo (RECOMENDADO)",
            correcto: true,
            json: {
                name: "EXISTE_PROC_CAB",
                isFunction: true,
                params: [
                    { name: "vCOUNT", direction: "OUT", type: "number" },
                    { name: "vIDGRUPOREP", value: -1, direction: "IN" }
                ]
            },
            razon: "El sinónimo resuelve automáticamente a WORKFLOW.EXISTE_PROC_CAB"
        },
        {
            caso: "2. Función dentro de un paquete",
            correcto: true,
            json: {
                name: "WORKFLOW.GET_PERIODO_ACTIVO",
                isFunction: true,
                params: [
                    { name: "resultado", direction: "OUT", type: "number" }
                ]
            },
            razon: "WORKFLOW.GET_PERIODO_ACTIVO es paquete.función (sin campo schema)"
        },
        {
            caso: "3. Con campo schema (SOLO si no hay conflicto)",
            correcto: false,
            json: {
                schema: "WORKFLOW",
                name: "EXISTE_PROC_CAB",
                isFunction: true,
                params: []
            },
            razon: "❌ NO USAR - Hay conflicto: existe paquete WORKFLOW"
        },
        {
            caso: "4. Función en otro esquema sin conflicto",
            correcto: true,
            json: {
                schema: "OTRO_ESQUEMA",
                name: "MI_FUNCION",
                isFunction: true,
                params: []
            },
            razon: "✅ OK si: 1) No hay paquete OTRO_ESQUEMA, 2) Tienes permisos EXECUTE"
        }
    ];

    examples.forEach((ex, i) => {
        console.log(`${ex.correcto ? '✅' : '❌'} ${ex.caso}`);
        console.log("   JSON:", JSON.stringify(ex.json, null, 2).replace(/\n/g, '\n   '));
        console.log(`   ${ex.razon}\n`);
    });

    console.log("═".repeat(60));
    console.log("\n💡 RECOMENDACIÓN PARA TU CASO:\n");
    console.log("Para EXISTE_PROC_CAB:");
    console.log("   • Usa: { \"name\": \"EXISTE_PROC_CAB\", ... }");
    console.log("   • NO uses: { \"schema\": \"WORKFLOW\", \"name\": \"EXISTE_PROC_CAB\", ... }");
    console.log("   • Razón: El sinónimo ya resuelve el conflicto paquete/esquema\n");

    console.log("Para procedimientos del paquete WORKFLOW:");
    console.log("   • Usa: { \"name\": \"WORKFLOW.PROCEDIMIENTO\", ... }");
    console.log("   • Esto llama al paquete (no al esquema)\n");
}

testSchemaUsage();
