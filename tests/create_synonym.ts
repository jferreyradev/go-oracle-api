// Crear sinónimo para EXISTE_PROC_CAB

const API_URL = "http://10.6.46.114:3013";
const TOKEN = "test1";

async function createSynonym() {
    console.log("=== Creando sinónimo ===\n");

    const createSyn = "CREATE OR REPLACE SYNONYM EXISTE_PROC_CAB FOR WORKFLOW.EXISTE_PROC_CAB";
    
    console.log("Ejecutando:", createSyn);
    console.log();
    
    try {
        const res = await fetch(`${API_URL}/query`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ query: createSyn })
        });
        
        const data = await res.json();
        console.log("Status:", res.status);
        
        if (res.ok) {
            console.log("✅ Sinónimo creado correctamente");
            console.log();
            console.log("Ahora puedes llamar a EXISTE_PROC_CAB sin especificar schema:");
            console.log('{ "name": "EXISTE_PROC_CAB", "isFunction": true, ... }');
        } else {
            console.log("❌ Error:", data.error);
        }
    } catch (error) {
        console.log("❌ Exception:", error.message);
    }
}

createSynonym();
