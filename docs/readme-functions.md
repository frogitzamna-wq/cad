# Mapeo completo de funciones: Legacy → Blockchain

## Índice
1. [Gestión de incidentes](#gestión-de-incidentes)
2. [Gestión de recursos](#gestión-de-recursos)
3. [Interoperabilidad de agencias](#interoperabilidad-de-agencias)
4. [Workflows y permisos](#workflows-y-permisos)
5. [Integración IoT](#integración-iot)

---

## Gestión de incidentes

### 1. Create Incident

**Legacy: `EventService.createEvent()`**

```mermaid
sequenceDiagram
    participant Op as Operator
    participant API as API Legacy
    participant ES as EventService
    participant Kafka as Kafka
    participant DB as PostgreSQL
    
    Op->>API: POST /events
    API->>ES: createEvent(EventCommand)
    ES->>DB: INSERT INTO event
    ES->>Kafka: Publish PERSIST event
    DB-->>ES: Event ID
    ES-->>API: EventCommand
    API-->>Op: 201 Created
```

**Blockchain: `IncidentManager.createIncident()`**

```mermaid
sequenceDiagram
    participant Op as Operator
    participant API as API Blockchain
    participant IM as IncidentManager
    participant BSV as BSV Blockchain
    participant IDX as SPV Indexer
    
    Op->>API: POST /incidents
    API->>IM: createIncident(data)
    IM->>IM: Build IncidentContract TX
    IM->>IM: Sign with operator key
    IM->>BSV: Broadcast TX
    BSV->>BSV: Validate & mine (~3s)
    BSV->>IDX: TX confirmed
    IDX->>IDX: Index incident
    IDX-->>API: WebSocket notification
    API-->>Op: 201 Created {txid}
```

**Mapeo de datos:**

| Campo Legacy | Campo Blockchain | Tipo | Notas |
|-------------|------------------|------|-------|
| `id` (Long) | `txid` (string) | ID único | TXID de la TX de creación |
| `reason` (EventReason) | `reason` (string) | Motivo | Código de motivo (ASSAULT, FIRE, etc.) |
| `priority` (ReasonPriority) | `priority` (number) | Prioridad | 1-5 (1=más alta) |
| `description` (String) | `description` (string) | Descripción | Detalles del incidente |
| `status` (StatusEnum) | `status` (number) | Estado | 0=CREATED, 1=PENDING, ..., 6=CLOSED |
| `createdAt` (LocalDateTime) | `timestamp` (number) | Timestamp | Unix timestamp en ms |
| `createdBy` (AppUser) | `operatorPubKey` (string) | Operador | Public key del operador |
| `eventBranches` (List) | `agencies` (string[]) | Agencias | Array de public keys de agencias |

**Contrato sCrypt simplificado:**

```typescript
class IncidentContract extends SmartContract {
  @prop() readonly incidentId: ByteString;
  @prop() status: bigint;
  @prop() priority: bigint;
  @prop() dataHash: ByteString; // SHA256 de datos completos
  @prop() agencyPubKeys: FixedArray<PubKey, 10>;
  @prop() operatorPubKey: PubKey;
  
  @method()
  public create(sig: Sig, incidentData: ByteString) {
    assert(this.checkSig(sig, this.operatorPubKey));
    assert(this.status == 0n); // CREATED
    assert(sha256(incidentData) == this.dataHash);
    
    const output = this.buildStateOutput(this.buildScript(), 1000n);
    assert(hash256(output) == this.ctx.hashOutputs);
  }
}
```

---

### 2. Update Incident

**Flujo comparativo:**

```mermaid
graph LR
    subgraph "Legacy"
        L1[Update Request] --> L2[EventService]
        L2 --> L3[UPDATE event table]
        L3 --> L4[Kafka PUBLISH]
        L4 --> L5[Response]
    end
    
    subgraph "Blockchain"
        B1[Update Request] --> B2[IncidentManager]
        B2 --> B3[Spend prev UTXO]
        B3 --> B4[Create new UTXO]
        B4 --> B5[Broadcast TX]
        B5 --> B6[Indexer detects]
        B6 --> B7[WebSocket notify]
    end
    

```

**Diferencias clave:**

| Aspecto | Legacy | Blockchain |
|---------|--------|-----------|
| **Mutabilidad** | Row UPDATE (mutable) | New UTXO (immutable) |
| **Historial** | Requiere EventLog table | Nativo en cadena de TXs |
| **Concurrencia** | Row-level lock | Optimistic (version check) |
| **Rollback** | Transaction rollback | New TX revirtiendo cambio |

---

### 3. Close Incident

**Diagrama de estados:**

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> PENDING: Operator validates
    PENDING --> DISPATCHED: Dispatcher assigns unit
    DISPATCHED --> EN_ROUTE: Unit accepts & departs
    EN_ROUTE --> ON_SCENE: Unit arrives
    ON_SCENE --> RESOLVED: Situation resolved
    RESOLVED --> CLOSED: Supervisor closes
    
    CREATED --> CLOSED: Operator cancels
    PENDING --> CLOSED: Dispatcher cancels
    
    CLOSED --> [*]
```

**Legacy: `EventService.closeEvent()`**

```java
public void closeEvent(Long id, String additionalFields, 
                       Long idBranch, String description) {
    Event event = findById(id);
    event.setStatus(StatusEnum.CLOSED);
    event.setDuration(calculateDuration());
    
    ClosureReport report = new ClosureReport();
    report.setEvent(event);
    report.setAdditionalFields(additionalFields);
    
    eventRepository.save(event);
    closureReportRepository.save(report);
    
    eventProducer.sendMessage(eventCommand, "UPDATE");
}
```

**Blockchain: `IncidentManager.closeIncident()`**

```typescript
async closeIncident(
  incidentId: string,
  closureReport: ClosureReport,
  operatorPrivKey: PrivateKey
): Promise<string> {
  // 1. Fetch current incident UTXO
  const currentUtxo = await this.getIncidentUtxo(incidentId);
  
  // 2. Build close transaction
  const tx = new Transaction()
    .addInput(currentUtxo) // Spend current state
    .addOutput(new Transaction.Output({
      script: IncidentContract.buildClosedScript(incidentId),
      satoshis: 1000
    }))
    .addOutput(new Transaction.Output({
      script: Script.buildSafeDataOut(JSON.stringify({
        type: 'INCIDENT_CLOSED',
        incidentId,
        duration: Date.now() - currentUtxo.timestamp,
        closureReport
      })),
      satoshis: 0
    }))
    .sign(operatorPrivKey);
  
  // 3. Broadcast
  const txid = await this.broadcast(tx);
  return txid;
}
```

---

### 4. Split Incident

**Caso de uso:** Un incidente inicial resulta ser dos incidentes separados.

**Diagrama:**

```mermaid
graph TD
    O[Original Incident<br/>UTXO₀] -->|Split TX| S1[Original Incident<br/>UTXO₁]
    O -->|Split TX| S2[New Incident<br/>UTXO₀]
    
    S1 --> R1[IncidentRelation<br/>type: SPLIT]
    S2 --> R1
    
```

**Transacción atómica:**

```
Inputs:
  [0] Original IncidentContract UTXO
  [1] Funding UTXO (for fees)

Outputs:
  [0] Original IncidentContract UTXO (updated, reference to split)
  [1] New IncidentContract UTXO (cloned data)
  [2] IncidentRelationContract UTXO (type: SPLIT)
  [3] OP_RETURN (split metadata)
  [4] Change UTXO
```

---

### 5. Combine Incidents

**Caso de uso:** Dos incidentes reportados son el mismo evento.

**Diagrama:**

```mermaid
sequenceDiagram
    participant D as Dispatcher
    participant IM as IncidentManager
    participant BSV as BSV Blockchain
    
    D->>IM: combineIncidents(sourceId, destId)
    IM->>IM: Validate both incidents open
    IM->>IM: Build atomic TX
    
    Note over IM: TX with 2 inputs, 3+ outputs
    
    IM->>BSV: Broadcast combine TX
    BSV->>BSV: Mine TX
    
    Note over BSV: Source → CLOSED<br/>Dest → Updated with source ref<br/>Relation → COMBINE
    
    BSV-->>D: Combined successfully
```

**Validación en contrato:**

```typescript
class IncidentContract extends SmartContract {
  @method()
  public combine(
    sig: Sig,
    sourceIncidentId: ByteString,
    sourceUtxo: UTXO
  ) {
    // Solo dispatcher o supervisor puede combinar
    assert(this.checkSig(sig, this.dispatcherPubKey));
    
    // Ambos incidentes deben estar abiertos
    assert(this.status < 6n);
    assert(sourceUtxo.status < 6n);
    
    // Deben ser del mismo tipo y agencia
    assert(this.reason == sourceUtxo.reason);
    assert(this.agencyPubKeys[0] == sourceUtxo.agencyPubKeys[0]);
    
    // Close source, update destination
    // ... (código de actualización)
  }
}
```

---

### 6. Relate Incidents

**Tipos de relaciones:**

```mermaid
graph TB
    I1[Incident A] -.RELATED.-> I2[Incident B]
    I3[Parent Incident] -->|PARENT| I4[Child Incident]
    I5[Source Incident] -.COMBINE.-> I6[Destination Incident]
    I7[Original Incident] -.SPLIT.-> I8[New Incident]
    
    style I1 fill:#afa
    style I2 fill:#afa
    style I3 fill:#ffa
    style I4 fill:#aaf
    style I5 fill:#faa
    style I6 fill:#afa
    style I7 fill:#faa
    style I8 fill:#afa
```

**Contrato IncidentRelationContract:**

```typescript
class IncidentRelationContract extends SmartContract {
  @prop() sourceIncidentId: ByteString;
  @prop() destIncidentId: ByteString;
  @prop() relationType: bigint; // 0=RELATE, 1=PARENT, 2=COMBINE, 3=SPLIT
  @prop() timestamp: bigint;
  @prop() createdBy: PubKey;
  
  @method()
  public create(
    sig: Sig,
    sourceUtxo: UTXO,
    destUtxo: UTXO
  ) {
    assert(this.checkSig(sig, this.createdBy));
    
    // Validar que ambos incidentes existen
    assert(sourceUtxo.incidentId == this.sourceIncidentId);
    assert(destUtxo.incidentId == this.destIncidentId);
    
    // Crear relación
    const output = this.buildStateOutput(this.buildScript(), 1000n);
    assert(hash256(output) == this.ctx.hashOutputs);
  }
}
```

---

## Gestión de recursos

### 7. Dispatch Resource

**Flujo completo:**

```mermaid
sequenceDiagram
    participant D as Dispatcher
    participant DM as DispatchManager
    participant RM as ResourceManager
    participant BSV as BSV Blockchain
    participant Unit as Field Unit
    
    D->>DM: dispatchResource(incidentId, unitId)
    DM->>RM: checkAvailability(unitId)
    RM-->>DM: Unit AVAILABLE
    
    DM->>DM: Build dispatch TX
    Note over DM: Atomic TX:<br/>- Update Incident (DISPATCHED)<br/>- Update Resource (DISPATCHED)<br/>- Create DispatchContract
    
    DM->>BSV: Broadcast dispatch TX
    BSV->>BSV: Mine & confirm
    BSV-->>Unit: WebSocket: New dispatch
    Unit->>Unit: Accept dispatch
    Unit->>RM: updateStatus(EN_ROUTE)
    RM->>BSV: Broadcast status update TX
```

**Estados de recurso:**

| Estado | Código | Descripción | Transiciones permitidas |
|--------|--------|-------------|------------------------|
| AVAILABLE | 0 | Disponible para despacho | → DISPATCHED |
| DISPATCHED | 1 | Asignado a incidente | → EN_ROUTE, AVAILABLE |
| EN_ROUTE | 2 | En camino a la escena | → ON_SCENE, AVAILABLE |
| ON_SCENE | 3 | En la escena del incidente | → AVAILABLE, OUT_OF_SERVICE |
| OUT_OF_SERVICE | 4 | Fuera de servicio | → AVAILABLE |

**ResourceContract:**

```typescript
class ResourceContract extends SmartContract {
  @prop() resourceId: ByteString;
  @prop() resourceType: bigint; // 0=POLICE, 1=AMBULANCE, 2=FIRE
  @prop() status: bigint;
  @prop() currentIncidentId: ByteString; // Empty si no asignado
  @prop() location: GeoLocation;
  @prop() agencyPubKey: PubKey;
  
  @method()
  public dispatch(
    sig: Sig,
    incidentId: ByteString,
    dispatcherPubKey: PubKey
  ) {
    assert(this.checkSig(sig, dispatcherPubKey));
    assert(this.status == 0n); // AVAILABLE
    
    let newState = this;
    newState.status = 1n; // DISPATCHED
    newState.currentIncidentId = incidentId;
    
    const output = newState.buildStateOutput();
    assert(hash256(output) == this.ctx.hashOutputs);
  }
}
```

---

### 8. Update GPS Location

**Alta frecuencia:** Cada unidad actualiza su ubicación cada 30 segundos.

**Optimización batch:**

```mermaid
graph LR
    U1[Unit 1<br/>GPS Update] --> B[Batch Manager]
    U2[Unit 2<br/>GPS Update] --> B
    U3[Unit 3<br/>GPS Update] --> B
    U4[Unit 4<br/>GPS Update] --> B
    
    B --> TX[Single TX<br/>4 GPS updates]
    TX --> BSV[BSV Blockchain]
    
    style B fill:#ffa
    style TX fill:#afa
```

**Transacción batch:**

```
Inputs:
  [0] Resource 1 UTXO
  [1] Resource 2 UTXO
  [2] Resource 3 UTXO
  [3] Resource 4 UTXO
  [4] Funding UTXO

Outputs:
  [0] Resource 1 UTXO (new location)
  [1] Resource 2 UTXO (new location)
  [2] Resource 3 UTXO (new location)
  [3] Resource 4 UTXO (new location)
  [4] OP_RETURN (batch GPS metadata)
  [5] Change UTXO
```

**Costo:**
- Single update: ~$0.0001
- Batch 4 updates: ~$0.0002 (50% savings)
- Batch 10 updates: ~$0.0003 (70% savings)

---

## Interoperabilidad de agencias

### 9. Share Incident with Agency

**Caso de uso:** Incidente cruza límite jurisdiccional, requiere apoyo de otra agencia.

```mermaid
sequenceDiagram
    participant A1 as Agency A<br/>Dispatcher
    participant IM as IncidentManager
    participant BSV as Blockchain
    participant A2 as Agency B<br/>Dispatcher
    
    A1->>IM: shareIncident(incidentId, agencyBPubKey)
    IM->>IM: Validate A1 owns incident
    IM->>IM: Build share TX
    Note over IM: Add agencyBPubKey to<br/>agencyPubKeys array
    IM->>BSV: Broadcast TX
    BSV->>BSV: Mine TX
    BSV-->>A2: WebSocket: Shared incident
    A2->>A2: Display incident on map
    A2->>IM: Optionally: assignResource(incidentId, unitId)
```

**AgencyContract:**

```typescript
class AgencyContract extends SmartContract {
  @prop() agencyId: ByteString;
  @prop() agencyName: ByteString;
  @prop() agencyPubKey: PubKey;
  @prop() jurisdiction: GeoPolygon; // Límites geográficos
  @prop() sharedIncidents: FixedArray<ByteString, 100>;
  
  @method()
  public shareIncident(
    sig: Sig,
    incidentId: ByteString,
    targetAgencyPubKey: PubKey
  ) {
    assert(this.checkSig(sig, this.agencyPubKey));
    
    // Agregar a lista de compartidos
    let newState = this;
    // ... (lógica de agregar)
    
    const output = newState.buildStateOutput();
    assert(hash256(output) == this.ctx.hashOutputs);
  }
}
```

---

### 10. Transfer Incident

**Diferencia con Share:** Transfer transfiere completamente el ownership.

```mermaid
graph LR
    A[Agency A Incident<br/>Owner: A] -->|Transfer TX| B[Agency B Incident<br/>Owner: B]
    
    A -.-> R[IncidentRelation<br/>type: TRANSFER]
    B -.-> R
    
    style A fill:#faa
    style B fill:#afa
    style R fill:#aaf
```

**Validación multi-firma:**

```typescript
@method()
public transfer(
  sigSource: Sig,
  sigDest: Sig,
  sourceAgencyPubKey: PubKey,
  destAgencyPubKey: PubKey
) {
  // Requiere firma de ambas agencias
  assert(this.checkSig(sigSource, sourceAgencyPubKey));
  assert(this.checkSig(sigDest, destAgencyPubKey));
  
  // Cambiar ownership
  let newState = this;
  newState.agencyPubKeys[0] = destAgencyPubKey;
  
  const output = newState.buildStateOutput();
  assert(hash256(output) == this.ctx.hashOutputs);
}
```

---

## Workflows y permisos

### 11. Operator vs Supervisor Permissions

**Matriz de permisos:**

| Acción | Operator | Supervisor | Admin |
|--------|----------|-----------|-------|
| Create incident | ✅ | ✅ | ✅ |
| Update incident | ✅ (own) | ✅ (any) | ✅ (any) |
| Close incident | ❌ | ✅ | ✅ |
| Reopen incident | ❌ | ✅ | ✅ |
| Dispatch resource | ❌ | ✅ | ✅ |
| Combine incidents | ❌ | ✅ | ✅ |
| Share with agency | ❌ | ✅ | ✅ |
| Transfer to agency | ❌ | ❌ | ✅ |

**Implementación en contrato:**

```typescript
class IncidentContract extends SmartContract {
  @prop() operatorPubKey: PubKey;
  @prop() supervisorPubKeys: FixedArray<PubKey, 5>;
  @prop() adminPubKey: PubKey;
  
  @method()
  validatePermission(sig: Sig, action: bigint): boolean {
    switch (action) {
      case 0n: // CREATE
        return this.checkSig(sig, this.operatorPubKey) ||
               this.checkAnySig(sig, this.supervisorPubKeys) ||
               this.checkSig(sig, this.adminPubKey);
      
      case 1n: // UPDATE
        // Similar logic
        
      case 2n: // CLOSE
        return this.checkAnySig(sig, this.supervisorPubKeys) ||
               this.checkSig(sig, this.adminPubKey);
      
      // ... más acciones
    }
  }
}
```

---

## Integración IoT

### 12. Panic Button → Auto-create Incident

**Flujo:**

```mermaid
sequenceDiagram
    participant PB as Panic Button
    participant IOT as IoT Gateway
    participant IM as IncidentManager
    participant CAM as Camera System
    participant BSV as Blockchain
    participant D as Dispatcher
    
    PB->>IOT: Panic signal (MQTT)
    IOT->>IOT: Extract device location
    IOT->>IM: createEmergencyIncident(deviceId, location)
    
    par Auto-create incident
        IM->>BSV: Broadcast incident TX
    and Find nearby cameras
        IM->>CAM: getCamerasNear(location, radius=500m)
        CAM-->>IM: [cam1, cam2, cam3]
    and Index cameras
        IM->>BSV: Anchor camera refs to incident
    end
    
    BSV-->>D: WebSocket: EMERGENCY incident
    D->>D: Alarm sound + map highlight
    D->>IM: dispatchNearestUnit(incidentId)
```

**Incident metadata IoT:**

```json
{
  "type": "INCIDENT_CREATED",
  "origin": "PANIC_BUTTON",
  "deviceId": "PB-12345",
  "location": {
    "lat": 19.432608,
    "lng": -99.133209,
    "accuracy": 5
  },
  "priority": 1,
  "reason": "EMERGENCY_PANIC",
  "nearbyCameras": [
    {
      "cameraId": "CAM-001",
      "distance": 50,
      "videoUrl": "uhrp://..."
    },
    {
      "cameraId": "CAM-002",
      "distance": 120,
      "videoUrl": "uhrp://..."
    }
  ],
  "autoDispatch": true
}
```

---

## Resumen de mapeo

### Tabla maestra: Legacy → Blockchain

| # | Función Legacy | Función Blockchain | Contrato | Complejidad |
|---|---------------|-------------------|----------|-------------|
| 1 | `createEvent` | `createIncident` | IncidentContract | Media |
| 2 | `updateEvent` | `updateIncident` | IncidentContract | Media |
| 3 | `closeEvent` | `closeIncident` | IncidentContract | Media |
| 4 | `reopenEvent` | `reopenIncident` | IncidentContract | Baja |
| 5 | `splitEvent` | `splitIncident` | Incident + Relation | Alta |
| 6 | `combineEvent` | `combineIncidents` | Incident + Relation | Alta |
| 7 | `relateEvent` | `relateIncidents` | IncidentRelation | Media |
| 8 | `extendEvent` | `extendIncident` | Incident + Relation | Media |
| 9 | `assignBranches` | `shareIncident` | Agency | Media |
| 10 | `unassignBranches` | `unshareIncident` | Agency | Media |
| 11 | N/A (nuevo) | `dispatchResource` | Resource + Dispatch | Alta |
| 12 | N/A (nuevo) | `updateGPS` | Resource | Baja |
| 13 | N/A (nuevo) | `transferIncident` | Agency + Relation | Alta |
| 14 | N/A (nuevo) | `panicButtonIncident` | Incident + IoT | Media |

**Total de contratos:**
- IncidentContract: 1
- ResourceContract: 1
- DispatchContract: 1
- AgencyContract: 1
- IncidentRelationContract: 1
- **Total: 5 contratos sCrypt**

---

**Siguiente:** [README-test-scenarios.md](./readme-test-scenarios.md) - Escenarios de prueba detallados
