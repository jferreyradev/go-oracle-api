# Funcionalidades Avanzadas - Go Oracle API

Este documento describe las funcionalidades avanzadas implementadas en la API para mejorar la integración con Oracle.

## 🔧 Ejecución de Procedimientos y Funciones de Paquetes

### Características principales
- Soporte completo para procedimientos y funciones dentro de paquetes Oracle
- Detección automática si es función usando `isFunction: true`
- Manejo inteligente de parámetros IN y OUT
- Soporte para múltiples tipos de datos

### Sintaxis para funciones
```json
{
  "name": "ESQUEMA.PAQUETE.NOMBRE_FUNCION",
  "isFunction": true,
  "params": [
    { "name": "parametro_entrada", "value": "valor" },
    { "name": "resultado", "direction": "OUT" }
  ]
}
```

### Sintaxis para procedimientos
```json
{
  "name": "ESQUEMA.PAQUETE.NOMBRE_PROCEDIMIENTO", 
  "params": [
    { "name": "param1", "value": "valor1" },
    { "name": "param2", "value": 123 },
    { "name": "param_out", "direction": "OUT" }
  ]
}
```

## 📅 Detección Automática de Fechas

### Conversión automática por nombre
La API detecta automáticamente parámetros de fecha basándose en el nombre del parámetro:
- Nombres que contengan: `fecha`, `periodo`
- Formatos soportados: `yyyy-mm-dd`, `dd/mm/yyyy`

### Ejemplo
```json
{
  "name": "MI_PROCEDIMIENTO",
  "params": [
    { "name": "vPERIODO", "value": "2025-10-21" },      // Detectado como fecha
    { "name": "fecha_inicio", "value": "21/10/2025" },   // Detectado como fecha
    { "name": "otro_param", "value": "texto normal" }    // String normal
  ]
}
```

## 🎯 Sistema de Detección de Tipos

### Para parámetros IN (automático)
- **String**: `"valor"` → VARCHAR2
- **Number**: `123` → NUMBER  
- **Fecha**: `"2025-10-21"` → DATE (si el nombre contiene `fecha` o `periodo`)
- **Boolean**: `true/false` → se convierte a 1/0

### Para parámetros OUT (por nombre o explícito)

#### Detección automática por nombre
- **Numéricos**: `resultado`, `result`, `total`, `count`, `suma`, `num`, `int`, `id`
- **Fechas**: `fecha`, `periodo`
- **Strings**: todos los demás (buffer de 4000 caracteres)

#### Especificación explícita (recomendada para OUT)
```json
{
  "name": "MI_PROCEDIMIENTO",
  "params": [
    { "name": "param_in", "value": 123 },                           // IN - automático
    { "name": "param_out1", "direction": "OUT", "type": "number" }, // OUT - explícito  
    { "name": "param_out2", "direction": "OUT", "type": "string" }, // OUT - explícito
    { "name": "param_out3", "direction": "OUT" }                    // OUT - automático por nombre
  ]
}
```

## 📝 Consultas Multilínea

### Características
- Soporte nativo para consultas SQL en múltiples líneas
- Normalización automática de saltos de línea (`\r\n`, `\n`, `\\n`)
- Compatible con cualquier editor que envíe JSON

### Ejemplo
```json
{
  "query": "SELECT p.dni, p.nombre, p.apellido,
                   e.empresa, e.cargo
            FROM personas p
            INNER JOIN empleados e ON p.dni = e.dni
            WHERE p.activo = 'S'
              AND e.fecha_ingreso >= TO_DATE('2025-01-01', 'YYYY-MM-DD')
            ORDER BY p.apellido, p.nombre"
}
```

## 🌐 Integración CORS Mejorada

### Configuración automática
- Headers CORS configurados para cualquier origen (`*`)
- Soporte completo para peticiones preflight (OPTIONS)
- Compatible con aplicaciones web modernas

### Métodos soportados
- `GET`, `POST`, `OPTIONS`
- Headers permitidos: `Content-Type`, `Authorization`

## 🔍 Manejo Robusto de Errores

### Tipos de error manejados
- **ORA-06502**: Buffer insuficiente (solucionado con buffer ampliado)
- **ORA-06550**: Error de sintaxis PL/SQL
- **ORA-00942**: Tabla/vista no existe
- **ORA-01861**: Formato de fecha incorrecto

### Respuestas de error
```json
{
  "error": "Descripción detallada del error Oracle con código y posición"
}
```

## 📊 Ejemplos Completos

### Función de paquete con múltiples parámetros
```bash
curl -X POST http://localhost:8080/procedure \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "name": "FINANZAS.CALCULOS.INTERES_COMPUESTO",
    "isFunction": true,
    "params": [
      { "name": "capital_inicial", "value": 10000 },
      { "name": "tasa_interes", "value": 0.05 },
      { "name": "periodo_meses", "value": 12 },
      { "name": "resultado_final", "direction": "OUT", "type": "number" }
    ]
  }'
```

### Procedimiento con fecha y parámetros OUT
```bash
curl -X POST http://localhost:8080/procedure \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "name": "REPORTES.VENTAS.GENERAR_INFORME",
    "params": [
      { "name": "fecha_desde", "value": "2025-01-01" },
      { "name": "fecha_hasta", "value": "2025-12-31" },
      { "name": "tipo_reporte", "value": "MENSUAL" },
      { "name": "total_ventas", "direction": "OUT", "type": "number" },
      { "name": "mensaje_resultado", "direction": "OUT", "type": "string" }
    ]
  }'
```

## 🚀 Rendimiento y Optimizaciones

### Mejoras implementadas
- Buffer optimizado para parámetros OUT (4000 caracteres)
- Detección inteligente de tipos sin overhead
- Manejo eficiente de conexiones Oracle
- Logging detallado para debugging

### Recomendaciones
- Usa `type` explícito para parámetros críticos
- Aprovecha la detección automática para simplificar el código
- Utiliza nombres descriptivos para activar la detección automática

---

## 💡 Tips y Buenas Prácticas

1. **Nombres descriptivos**: Usa nombres como `fecha_periodo`, `resultado_total`, `count_registros` para activar la detección automática.

2. **Funciones vs Procedimientos**: Siempre usa `"isFunction": true` para funciones, esto asegura el orden correcto de parámetros.

3. **Manejo de fechas**: Prefiere el formato `yyyy-mm-dd` para mejor compatibilidad.

4. **Campo type**: 
   - ❌ **NO uses `type` en parámetros IN** (se detecta automáticamente por el valor JSON)
   - ✅ **SÍ usa `type` en parámetros OUT** cuando tengas dudas sobre la detección automática

5. **Simplifica tu JSON**: Los parámetros IN no necesitan especificación de tipo:
   ```json
   // ✅ Correcto - simple y limpio
   { "name": "param", "value": 123 }
   
   // ❌ Innecesario para IN
   { "name": "param", "value": 123, "type": "number" }
   ```

6. **Testing**: Utiliza los scripts en `scripts/` para validar nuevos procedimientos antes de integrarlos.