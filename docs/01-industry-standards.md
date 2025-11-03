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

## 4. Migración de sistemas legacy típicos

### 4.1 Patrones comunes en sistemas CAD existentes

Los sistemas CAD legacy típicamente implementan los siguientes patrones:

| Componente estándar | Patrón legacy común | Consideraciones de migración |
|---------------------|---------------------|------------------------------|
| **Incident Management** | Entidades tipo "Event" o "Case" | ✅ Mapeo directo a IncidentContract |
| **Incident Status** | Estados binarios (OPEN/CLOSED) | ⚠️ Expandir a estados intermedios (PENDING, DISPATCHED, ON_SCENE) |
| **Incident Type** | Catálogos predefinidos | ✅ Preservar taxonomía existente |
| **Incident Priority** | Niveles P1-P5 | ✅ Mapeo directo |
| **Location Tracking** | Registros de ubicación | ✅ Geohash indexing en blockchain |
| **Resource Management** | Unidades/vehículos | ⚠️ Frecuentemente distribuido en múltiples servicios |
| **Agency/Jurisdiction** | Entidades organizacionales | ✅ AgencyContract con permisos blockchain |
| **Incident Relations** | Merge/split/relate operations | ✅ IncidentRelationContract |
| **Call Records** | Logs de llamadas | ✅ Anclar grabaciones a UHRP |
| **Audit Trail** | Tablas de log | ✅ Event sourcing nativo en blockchain |

### 4.2 Operaciones legacy vs. ciclo de vida NENA

| Fase estándar | Operación legacy típica | Implementación blockchain |
|---------------|-------------------------|---------------------------|
| **Call Reception** | Crear registro preliminar | PreliminaryCallEvent → blockchain |
| **Incident Creation** | INSERT en tabla incidents | IncidentContract.create() |
| **Classification** | UPDATE incident_type, priority | IncidentContract.updateData() |
| **Dispatch** | Asignar recursos a incidente | DispatchContract.dispatch() |
| **Status Updates** | UPDATE incident_status | IncidentContract.changeStatus() |
| **Incident Relations** | Operaciones merge/split/relate | IncidentRelationContract |
| **Resource Assignment** | Link tables: incidents_resources | DispatchContract + ResourceContract |
| **Closure** | UPDATE status = CLOSED + report | IncidentContract.close() |
| **Reopen** | UPDATE status = OPEN | IncidentContract.reopen() |

### 4.3 Gaps típicos en sistemas legacy

**1. Estados intermedios:**
- **Legacy**: Usualmente 2-3 estados (OPEN, CLOSED, posiblemente IN_PROGRESS)
- **Requerido**: CREATED → PENDING → DISPATCHED → EN_ROUTE → ON_SCENE → RESOLVED → CLOSED

**2. Gestión de recursos distribuida:**
- **Legacy**: Información de unidades/recursos en servicios separados (fleet management, HR, etc.)
- **Requerido**: Vista unificada de recursos disponibles en tiempo real

**3. Despacho manual vs. automático:**
- **Legacy**: Asignación manual por dispatcher
- **Requerido**: Algoritmos de asignación automática (proximidad, disponibilidad, capacidades)

**4. Interoperabilidad limitada:**
- **Legacy**: Integración punto-a-punto entre agencias específicas
- **Requerido**: Protocolos estándar (APCO) para cualquier agencia

**5. Auditoría mutable:**
- **Legacy**: Logs en bases de datos relacionales (pueden editarse/borrarse)
- **Requerido**: Trail inmutable en blockchain

## 5. Arquitectura de migración blockchain

### 5.1 Preservar fortalezas del legacy

✅ **Modelo de datos existente:**
- Mapear entidades legacy a contratos sCrypt
- Preservar relaciones entre incidentes
- Mantener categorización y prioridades establecidas
- Respetar workflows operacionales

✅ **Event sourcing implícito:**
- Muchos sistemas legacy usan message queues (Kafka, RabbitMQ)
- Migrar a blockchain como event store inmutable
- Preservar tipos de eventos existentes

### 5.2 Expandir capacidades

⚠️ **Estados de incidente enriquecidos:**
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

⚠️ **Gestión unificada de recursos:**
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

⚠️ **Interoperabilidad estándar:**
- API REST/GraphQL para notificaciones APCO-compliant
- Mensajería P2P vía Message Box
- Autenticación basada en DIDs blockchain

### 5.3 Arquitectura blockchain propuesta

**1. Contratos inteligentes sCrypt:**
```
IncidentContract       - Gestión de ciclo de vida del incidente
ResourceContract       - Gestión de recursos/unidades
DispatchContract       - Lógica de asignación automática
AgencyContract         - Permisos y compartición entre agencias
IncidentRelationContract - Merge/split de incidentes
AuditContract          - Log inmutable de todas las acciones
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
- Geohash indexing para queries espaciales

**4. Almacenamiento de evidencia:**
- UHRP para video/audio/imágenes
- Anclas blockchain para integridad
- sCrypt contracts para access control (multisig)

## 6. Estrategia de migración por fases

### Fase 1: Adapter Layer (Mes 1-3)
- Deploy adapters para telephony, video, messaging
- Dual-write: legacy DB + blockchain
- Cero disrupción operacional

### Fase 2: Evidence Migration (Mes 4-9)
- Migrar evidencia histórica a UHRP
- Implementar sCrypt access controls
- Issue DIDs para todos los usuarios

### Fase 3: Event Sourcing (Mes 10-15)
- Reemplazar message queues con blockchain
- Deploy SPV indexers
- Deprecar bases de datos mutables

### Fase 4: Full Blockchain-Native (Mes 16-18)
- Wallet-native UI para dispatchers
- IoT devices escriben directamente a blockchain
- Decommissionar sistemas legacy

## 7. Referencias

- **NENA i3 Standard**: https://www.nena.org/page/i3_Stage3
- **APCO Standards**: https://www.apcointl.org/standards
- **BSV Teranode**: https://teranode.bsvblockchain.org
- **sCrypt**: https://scrypt.io
- **BSV Association**: https://www.bsvblockchain.org

---

**Status**: 📋 Reference Document  
**Version**: 2.0 - Obfuscated (Generic Legacy Patterns)  
**Updated**: 2025-11-03 18:45 CST
