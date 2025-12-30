const kv = await Deno.openKv();

/**
 * Servicio de Configuración de Backends para Proxy
 * 
 * Este servidor Deno KV almacena y sirve la configuración de backends
 * para el sistema de proxy multi-backend.
 * 
 * Deploy en Deno Deploy:
 *   1. dash.deno.com → New Project → Playground
 *   2. Copiar este código
 *   3. Save & Deploy
 *   4. Copiar la URL: https://tu-proyecto.deno.dev
 */

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Manejar OPTIONS (preflight)
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // GET /items - Listar todos los backends
    if (path === "/items" && req.method === "GET") {
      const items: any[] = [];
      const entries = kv.list({ prefix: ["backends"] });
      
      for await (const entry of entries) {
        items.push(entry.value);
      }
      
      return Response.json(items, { headers: corsHeaders });
    }

    // POST /items - Crear/Actualizar backend
    if (path === "/items" && req.method === "POST") {
      const data = await req.json();
      
      if (!data.name || !data.url || !data.token || !data.prefix) {
        return Response.json(
          { error: "Faltan campos requeridos: name, url, token, prefix" },
          { status: 400, headers: corsHeaders }
        );
      }
      
      const backendKey = ["backends", data.name.toLowerCase()];
      await kv.set(backendKey, {
        ...data,
        name: data.name.toLowerCase(),
        updatedAt: new Date().toISOString(),
      });
      
      return Response.json(
        { success: true, name: data.name.toLowerCase() },
        { status: 201, headers: corsHeaders }
      );
    }

    // GET /items/:name - Obtener backend específico
    if (path.startsWith("/items/") && req.method === "GET") {
      const name = path.split("/")[2];
      const result = await kv.get(["backends", name.toLowerCase()]);
      
      if (result.value === null) {
        return Response.json(
          { error: "Backend no encontrado" },
          { status: 404, headers: corsHeaders }
        );
      }
      
      return Response.json(result.value, { headers: corsHeaders });
    }

    // DELETE /items/:name - Eliminar backend
    if (path.startsWith("/items/") && req.method === "DELETE") {
      const name = path.split("/")[2];
      await kv.delete(["backends", name.toLowerCase()]);
      
      return Response.json(
        { success: true, deleted: name.toLowerCase() },
        { headers: corsHeaders }
      );
    }

    // GET / - Info del servicio
    if (path === "/") {
      return Response.json({
        service: "Backend Configuration API",
        version: "1.0.0",
        endpoints: {
          "GET /items": "Listar todos los backends",
          "POST /items": "Crear/Actualizar backend",
          "GET /items/:name": "Obtener backend específico",
          "DELETE /items/:name": "Eliminar backend",
        },
        schema: {
          name: "string (único)",
          url: "string (URL del backend)",
          token: "string (token de autorización)",
          prefix: "string (prefijo de ruta, ej: /prod)",
        },
      }, { headers: corsHeaders });
    }

    return Response.json(
      { error: "Endpoint no encontrado" },
      { status: 404, headers: corsHeaders }
    );

  } catch (error) {
    console.error("Error:", error);
    return Response.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
});
