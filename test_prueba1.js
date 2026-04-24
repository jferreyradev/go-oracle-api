/**
 * Test para procedimiento PRUEBA1
 */

const API_URL = "http://localhost:3000";
const TOKEN = "test1";

async function testPrueba1() {
    console.log("📋 Llamando a PRUEBA1...\n");
    
    try {
        const response = await fetch(`${API_URL}/procedure`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'PRUEBA1',
                params: [
                    {
                        name: 'vIDPERS',
                        value: 123,
                        direction: 'IN',
                        type: 'NUMBER'
                    },
                    {
                        name: 'vDNI',
                        value: 45678901,
                        direction: 'IN',
                        type: 'NUMBER'
                    },
                    {
                        name: 'vSALIDA',
                        direction: 'OUT',
                        type: 'NUMBER'
                    },
                    {
                        name: 'vError',
                        direction: 'OUT',
                        type: 'NUMBER'
                    },
                    {
                        name: 'vErrorMsg',
                        direction: 'OUT',
                        type: 'STRING'
                    }
                ]
            })
        });

        const data = await response.json();
        
        console.log("Status HTTP:", response.status);
        console.log("\n✅ Respuesta:");
        console.log(JSON.stringify(data, null, 2));
        
        if (data.status === 'ok' && data.out) {
            console.log("\n📊 Parámetros OUT recibidos:");
            console.log(`  • vSALIDA: ${data.out.vSALIDA || 'NO RECIBIDO'}`);
            console.log(`  • vError: ${data.out.vError || 'NO RECIBIDO'}`);
            console.log(`  • vErrorMsg: ${data.out.vErrorMsg || 'NO RECIBIDO'}`);
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

testPrueba1();
