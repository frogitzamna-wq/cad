# Estándares CAD de la industria

## 1. NENA i3 Standard (National Emergency Number Association)

### 1.1 Arquitectura i3
El estándar NENA i3 define la arquitectura de próxima generación para sistemas de emergencia 9-1-1 en Estados Unidos.

**Componentes principales:**
- **Emergency Services IP Network (ESInet)**: Red IP dedicada para tráfico de emergencia
- **Emergency Call Routing Function (ECRF)**: Enrutamiento de llamadas basado en ubicación
- **Location Validation Function (LVF)**: Validación de ubicaciones geográficas
- **Policy Routing Function (PRF)**: Reglas de enrutamiento y políticas

### 1.2 Ciclo de vida del incidente según NENA i3

```
Call Reception → Location Validation → Call Routing → PSAP Assignment → 
Incident Creation → Classification → Dispatch → Response → Resolution → Closure
```

**Etapas detalladas:**

1. **Call Reception**: Recepción de llamada de emergencia
   - Captura de ANI (Automatic Number Identification)
   - Captura de ALI (Automatic Location Identification)
   - Metadata de llamada (timestamp, tipo de red)

2. **Location Validation**: Validación de ubicación
   - Geocodificación de dirección
   - Validación contra base de datos MSAG (Master Street Address Guide)
   - Determinación de jurisdicción

3. **Call Routing**: Enrutamiento de llamada
   - Selección de PSAP (Public Safety Answering Point) apropiado
   - Transferencia si es necesario (call transfer/conference)

4. **PSAP Assignment**: Asignación a operador
   - Cola de llamadas
   - Distribución basada en carga de trabajo
   - Priorización

5. **Incident Creation**: Creación de incidente
   - Generación de ID único de incidente
   - Captura de información inicial del denunciante
   - Clasificación preliminar

6. **Classification**: Clasificación del incidente
   - Determinación de tipo de emergencia (medical, fire, police, etc.)
   - Asignación de prioridad (P1-P5)
   - Determinación de recursos necesarios

7. **Dispatch**: Despacho de recursos
   - Selección de unidades disponibles
   - Notificación a unidades
   - Asignación de ruta/ubicación

8. **Response**: Respuesta
   - En route (unidad en camino)
   - On scene (unidad en escena)
   - Actualizaciones de estado

9. **Resolution**: Resolución
   - Acciones tomadas
   - Resultados de intervención
   - Información de seguimiento

10. **Closure**: Cierre
    - Reporte final
    - Liberación de recursos
    - Archivado

## 2. APCO CAD-to-CAD Interoperability

### 2.1 Estándar APCO
La Association of Public-Safety Communications Officials (APCO) define estándares para interoperabilidad entre sistemas CAD.

**Principios clave:**
- **Formato de mensaje común**: XML o JSON para intercambio de datos
- **Tipos de mensaje estandarizados**: Incident Notification, Status Update, Resource Request
- **Protocolo de transporte**: HTTPS/REST o SOAP
- **Seguridad**: Autenticación mutua TLS, autorización basada en certificados

### 2.2 Tipos de intercambio CAD-to-CAD

**1. Notificación de incidente (Incident Notification)**
```json
{
  "messageType": "IncidentNotification",
  "incidentId": "AGY1-2024-001234",
  "timestamp": "2024-11-03T06:30:00Z",
  "originatingAgency": "AGENCY_ALFA",
  "location": {
    "latitude": 19.432608,
    "longitude": -99.133209,
    "address": "Av. Juárez 50, Centro, CDMX"
  },
  "incidentType": "VEHICLE_ACCIDENT",
  "priority": "P2",
  "description": "Accidente vehicular con lesionados"
}
```

**2. Solicitud de recursos (Resource Request)**
```json
{
  "messageType": "ResourceRequest",
  "incidentId": "AGY1-2024-001234",
  "requestingAgency": "AGENCY_ALFA",
  "resourceType": "AMBULANCE",
  "quantity": 2,
  "urgency": "IMMEDIATE",
  "location": { /* ... */ }
}
```

**3. Actualización de estado (Status Update)**
```json
{
  "messageType": "StatusUpdate",
  "incidentId": "AGY1-2024-001234",
  "resourceId": "UNIT_AMB_01",
  "status": "ON_SCENE",
  "timestamp": "2024-11-03T06:45:00Z",
  "location": { /* ... */ }
}
```

**4. Transferencia de incidente (Incident Transfer)**
```json
{
  "messageType": "IncidentTransfer",
  "incidentId": "AGY1-2024-001234",
  "fromAgency": "AGENCY_ALFA",
  "toAgency": "AGENCY_BETA",
  "reason": "JURISDICTIONAL_BOUNDARY",
  "incidentData": { /* complete incident object */ }
}
```

## 3. PSAP Standards

### 3.1 Requisitos funcionales de un PSAP

**Gestión de llamadas:**
- Atención simultánea de múltiples llamadas
- Cola de llamadas con priorización
- Transferencia de llamadas (warm/cold transfer)
- Conferencia de llamadas
- TTY/TDD para personas con discapacidad auditiva

**Gestión de incidentes:**
- Creación rápida de incidentes (<30 segundos)
- Clasificación y priorización
- Actualización en tiempo real
- Relación de incidentes (duplicate, related, parent-child)

**Gestión de recursos:**
- Visualización de disponibilidad de unidades
- Despacho automático basado en proximidad/disponibilidad
- Rastreo GPS en tiempo real
- Estado de unidades (available, dispatched, on-scene, etc.)

**Auditoría y cumplimiento:**
- Registro completo de todas las acciones
- Grabación de llamadas
- Cadena de custodia para evidencia
- Reportes de performance (tiempos de respuesta, etc.)

### 3.2 Métricas de performance PSAP

| Métrica | Estándar NENA | Descripción |
|---------|---------------|-------------|
| Call Answer Time | 90% < 10s | Tiempo desde ingreso de llamada hasta respuesta |
| Call Processing Time | < 90s | Tiempo desde respuesta hasta despacho |
| Dispatch Time | < 60s | Tiempo desde decisión de despacho hasta notificación |
| Unit Response Time | < 8 min (P1) | Tiempo desde despacho hasta llegada a escena |

## 4. Mapeo con sistema legacy Promad

### 4.1 Entidades del sistema legacy vs. estándares

| Estándar | Entidad Legacy | Mapeo |
|----------|----------------|-------|
| Incident | `Event` | ✅ Mapeo directo |
| Incident Status | `StatusEnum` (OPEN/CLOSED) | ⚠️ Requiere estados adicionales (PENDING, DISPATCHED, ON_SCENE) |
| Incident Type | `EventType` | ✅ Mapeo directo |
| Incident Priority | `ReasonPriority` | ✅ Mapeo directo |
| Incident Location | `EventLocation` | ✅ Mapeo directo (soporta múltiples ubicaciones) |
| Resource/Unit | No identificado aún | ❌ Requiere investigación en otros microservicios |
| Agency/PSAP | `Branch` (via `EventBranch`) | ✅ Mapeo directo |
| Incident Relation | `EventRelation` (COMBINE/RELATE/PARENT) | ✅ Mapeo directo |
| Call Record | `PreliminaryEvent` | ✅ Mapeo parcial (pre-incidente) |
| Audit Log | `EventLog` | ✅ Mapeo directo |

### 4.2 Operaciones del sistema legacy vs. ciclo de vida estándar

| Fase estándar | Operación Legacy | Notas |
|---------------|------------------|-------|
| Call Reception | `PreliminaryEvent.create` | Pre-incidente en sistema legacy |
| Incident Creation | `EventService.createEvent` | ✅ Asíncrono con Kafka |
| Classification | Parte de `createEvent` | Asignación de `EventReason` y `ReasonPriority` |
| Dispatch | No identificado | ⚠️ Requiere investigación (posiblemente en `event-workflow-ms`) |
| Status Updates | `EventService.updateEvent` | ✅ Con propagación Kafka |
| Incident Relations | `splitEvent`, `combineEvent`, `relateEvent`, `extendEvent` | ✅ Soporta múltiples tipos de relación |
| Resource Assignment | `assignBranches`, `unassignBranches` | ⚠️ Parece gestión de agencias, no unidades |
| Closure | `EventService.closeEvent` | ✅ Con `ClosureReport` |
| Reopen | `EventService.reopenEvent` | ✅ Cambio de estado CLOSED → OPEN |

### 4.3 Gaps identificados en sistema legacy

**1. Estados intermedios de incidente:**
- Sistema actual: solo OPEN/CLOSED
- Requerido por estándares: PENDING, DISPATCHED, EN_ROUTE, ON_SCENE, RESOLVED, CLOSED

**2. Gestión de recursos/unidades:**
- No se encontró modelo de unidad/recurso en `event-core-ms`
- Se requiere investigación en otros microservicios

**3. Despacho automatizado:**
- No se identificó lógica de asignación automática de recursos
- Posiblemente en `event-workflow-ms` (pendiente investigación)

**4. Interoperabilidad CAD-to-CAD:**
- Sistema tiene soporte multi-agencia vía `EventBranch`
- No se identificó API de intercambio entre agencias (posiblemente en `ms-interoperabilidad`)

## 5. Recomendaciones para migración blockchain

### 5.1 Preservar del sistema legacy

✅ **Modelo de datos robusto:**
- `Event` con soporte multi-ubicación
- Relaciones entre incidentes bien definidas
- Auditoría completa con `EventLog`
- Multi-agencia con `EventBranch`

✅ **Event sourcing implícito:**
- Mensajería Kafka para cada operación
- Tipos de operación: PERSIST, UPDATE, DELETE

### 5.2 Mejorar en migración

⚠️ **Expandir estados de incidente:**
```typescript
enum IncidentStatus {
  CREATED = "CREATED",
  PENDING = "PENDING",
  DISPATCHED = "DISPATCHED",
  EN_ROUTE = "EN_ROUTE",
  ON_SCENE = "ON_SCENE",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED"
}
```

⚠️ **Agregar gestión de recursos:**
```typescript
interface Resource {
  id: string;
  type: ResourceType; // POLICE_UNIT, AMBULANCE, FIRE_TRUCK
  status: ResourceStatus; // AVAILABLE, DISPATCHED, ON_SCENE, OUT_OF_SERVICE
  location: GeoLocation;
  capabilities: string[];
  agency: string;
}
```

⚠️ **Implementar interoperabilidad CAD-to-CAD:**
- API REST para notificaciones entre agencias
- Mensajes APCO-compliant
- Autenticación basada en certificados blockchain

### 5.3 Arquitectura blockchain propuesta

**1. Contratos inteligentes sCrypt:**
```
IncidentContract - Gestión de ciclo de vida del incidente
ResourceContract - Gestión de recursos/unidades
DispatchContract - Lógica de asignación automática
AgencyContract - Permisos y compartición entre agencias
AuditContract - Log inmutable de todas las acciones
```

**2. Transacciones UTXO como event sourcing:**
- Cada cambio de estado = nueva transacción
- UTXO anterior = estado previo (inmutable)
- UTXO nuevo = estado actual
- Cadena de UTXOs = historial completo del incidente

**3. Indexación SPV:**
- Overlay network para queries en tiempo real
- Indexación por: agency, location, status, priority, resource
- Notificaciones push vía WebSocket

## 6. Próximos pasos

1. ✅ **Investigar `event-workflow-ms`** - Lógica de despacho y workflows
2. ⏳ **Buscar gestión de recursos** - Posiblemente en microservicios separados
3. ⏳ **Revisar `ms-interoperabilidad`** - API de intercambio entre agencias
4. ⏳ **Diseñar contratos sCrypt** - Basado en operaciones legacy identificadas
5. ⏳ **Implementar PoC** - Crear incidente → Actualizar → Cerrar en blockchain
