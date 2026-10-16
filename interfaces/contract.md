# interfaces/contract.md — v1.1 (CONGELADO, 16/10/2026)

> Congelado tras la aprobación de la Fase 0. Ningún agente lo cambia por su cuenta: cualquier cambio pasa por Traycer y actualiza también el PRD (regla §13.1).
>
> **v1.1** (aclaraciones tras la revisión de A-REVISOR; no cambian firmas, tipos, errores, eventos ni el comportamiento desplegado): requisito del token en §0, alcance de la extensión de TTL en §5.

Interfaz del contrato Soroban de Obra Pública Verificable, según el PRD v3. Es el acuerdo entre A-CONTRATO, A-BACKEND, A-FRONTEND y A-REVISOR: firmas, tipos, errores, eventos y **orden de validación**. El orden importa porque define qué error devuelve cada caso y las pruebas lo verifican.

## 0. Generalidades

- **SDK:** `soroban-sdk = "28.0.0"`, la versión que la documentación oficial lista para el Protocolo 29 (vigente en testnet desde el 29/09/2026) y la que genera `stellar contract init`. Existe la 29.0.1 (12/10/2026), pero la documentación todavía no la recomienda; la 29.0.0 no se usa (salió con un runtime equivocado). Toolchain: Rust ≥ 1.91, target `wasm32v1-none`, compilar con `stellar contract build` (no con `cargo build`), Stellar CLI 28.1.0. Fuentes en §7.
- **Un solo contrato, muchas obras.** Las obras se identifican con `obra: u32`, asignado por el contrato desde 1 en adelante. Los hitos con `hito: u32`, índice desde 0 (el frontend muestra `hito + 1`).
- **Sin inicialización.** El contrato no tiene administrador ni función `init`: cualquiera puede crear una obra firmando como su municipio.
- **Firmas.** Soroban no tiene un "llamador implícito": cada función pide la firma de una dirección concreta con `require_auth()`. Las funciones de un solo rol la piden a la dirección guardada en la obra (municipio, contratista, veedor, árbitro). `aprobar` recibe `firmante` explícito porque lo puede llamar el inspector o el veedor.
  - Si firma una cuenta equivocada en una función de un solo rol, la transacción falla con **error de autorización del host**, no con un error del contrato. `NoAutorizado` se usa solo cuando `firmante` no tiene rol.
- **Montos:** `i128` en la unidad mínima del token (7 decimales).
- **Hashes:** `BytesN<32>` (SHA-256 crudo; el backend lo expone en hex).
- **Tiempo:** `u64`, segundos, `env.ledger().timestamp()`.
- **Período de objeción:** ventana semiabierta `[momento_declaracion, momento_declaracion + periodo_objecion)`. Se puede objetar si `ahora < fin`; se puede pagar si `ahora >= fin`. No hay instante en que valgan las dos cosas.
- **Orden de efectos:** se actualiza el estado y después se transfiere el token.
- **Token de la obra (v1.1):** tiene que ser un Stellar Asset Contract, o un token que transfiera montos exactos (sin comisión ni rebase). El contrato no lo verifica: `fondeado` suma el monto pedido, no el recibido, así que un token con comisión compartido por dos obras mezclaría sus saldos. Además, un token sin valor deja una obra "Pagada" sin que el contratista reciba nada. Por eso el tablero muestra el token de cada obra y destaca las que no usan el SAC oficial de la demo.

## 1. Tipos

```rust
#[contracttype]
pub struct NuevoHito {
    pub descripcion: String,
    pub monto: i128,
}

#[contracttype]
pub enum EstadoObra { Activa, Finalizada }

#[contracttype]
pub enum EstadoHito { Pendiente, Evidencia, Aprobado, Objetado, Pagado }

#[contracttype]
pub enum Decision { Aceptar, Rechazar }

#[contracttype]
pub struct Obra {
    pub id: u32,
    pub nombre: String,
    pub municipio: Address,
    pub contratista: Address,
    pub inspector: Address,
    pub veedor: Address,
    pub arbitro: Address,
    pub token: Address,
    pub monto_original: i128,   // inmutable: suma de los montos originales de los hitos
    pub monto_vigente: i128,    // suma de los montos vigentes de los hitos
    pub fondeado: i128,         // acumulado depositado por el municipio
    pub pagado: i128,           // acumulado pagado al contratista
    pub periodo_objecion: u64,  // segundos
    pub cantidad_hitos: u32,
    pub estado: EstadoObra,
    pub creada_en: u64,
}

#[contracttype]
pub struct Hito {
    pub indice: u32,
    pub descripcion: String,
    pub monto_original: i128,                       // inmutable
    pub monto_vigente: i128,                        // cambia solo con adendas (Fase 4)
    pub estado: EstadoHito,
    pub evidencia_hash: Option<BytesN<32>>,         // de la declaración vigente
    pub momento_declaracion: Option<u64>,           // inicio del período de objeción
    pub aprobo_inspector: bool,
    pub aprobo_veedor: bool,
    pub veedor_por_arbitro: bool,                   // la aprobación del veedor vino de un Rechazar
    pub objecion_usada: bool,                       // en la declaración vigente
    pub motivo_objecion_hash: Option<BytesN<32>>,
    pub momento_aprobacion_completa: Option<u64>,
    pub momento_pago: Option<u64>,
}
```

Saldo de una obra = `fondeado − pagado`. Los fondos de cada obra están separados: un pago solo usa el saldo de su obra.

## 2. Errores

```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ObraNoExiste          = 1,
    HitoNoExiste          = 2,
    NoAutorizado          = 3,  // `firmante` no es inspector ni veedor
    RolesDuplicados       = 4,
    MontoInvalido         = 5,  // monto ≤ 0, lista de hitos vacía o suma desbordada
    ExcedeMontoTotal      = 6,  // fondeado + monto > monto_vigente
    FondosInsuficientes   = 7,  // saldo < monto_vigente del hito
    EstadoInvalido        = 8,  // la acción no corresponde al estado del hito
    HitoAnteriorPendiente = 9,  // el hito anterior no está Aprobado ni Pagado
    YaDecidio             = 10, // el rol ya aprobó (o el veedor ya decidió) en esta declaración
    ObjecionAbierta       = 11, // el hito está Objetado
    ObjecionYaUsada       = 12, // el veedor ya objetó en esta declaración (y fue rechazada)
    FueraDePeriodo        = 13, // objeción con ahora >= fin del período
    PeriodoNoCumplido     = 14, // pago con ahora < fin del período
    YaPagado              = 15,
}
```

Los códigos numéricos quedan congelados junto con el resto: el backend y el frontend los traducen a mensajes.

## 3. Funciones

En cada función, los pasos se evalúan **en este orden** y se devuelve el primer error que aplique. "Hito anterior OK" significa: `hito == 0`, o el hito `hito − 1` está `Aprobado` o `Pagado`.

### 3.1 `crear_obra`

```rust
fn crear_obra(env: Env, municipio: Address, nombre: String,
              contratista: Address, inspector: Address, veedor: Address, arbitro: Address,
              token: Address, hitos: Vec<NuevoHito>, periodo_objecion: u64) -> Result<u32, Error>
```

1. `municipio.require_auth()`.
2. `RolesDuplicados` si contratista, inspector, veedor y árbitro no son distintos entre sí, o si el municipio coincide con contratista, inspector o veedor. (El municipio **sí** puede ser el árbitro.)
3. `MontoInvalido` si `hitos` está vacío, algún monto es ≤ 0 o la suma desborda.

Efectos: nuevo id = último id + 1. Obra `Activa`, `monto_original = monto_vigente = Σ montos`, `fondeado = pagado = 0`. Hitos en `Pendiente` con `monto_original = monto_vigente`. Devuelve el id.
Evento: **obra creada**.

### 3.2 `fondear`

```rust
fn fondear(env: Env, obra: u32, monto: i128) -> Result<(), Error>
```

1. `ObraNoExiste`.
2. `obra.municipio.require_auth()`.
3. `MontoInvalido` si `monto ≤ 0`.
4. `ExcedeMontoTotal` si `fondeado + monto > monto_vigente`.

Efectos: `fondeado += monto`; transferencia de `monto` del municipio al contrato.
Evento: **obra fondeada**.

### 3.3 `declarar_hito`

```rust
fn declarar_hito(env: Env, obra: u32, hito: u32, evidencia_hash: BytesN<32>) -> Result<(), Error>
```

1. `ObraNoExiste`, `HitoNoExiste`.
2. `obra.contratista.require_auth()`.
3. `HitoAnteriorPendiente` si el hito anterior no está OK.
4. `EstadoInvalido` si el hito no está `Pendiente`.

Efectos: estado `Evidencia`; `evidencia_hash`; `momento_declaracion = ahora` (arranca el período); `aprobo_inspector = aprobo_veedor = veedor_por_arbitro = objecion_usada = false`; `motivo_objecion_hash = momento_aprobacion_completa = None`.
Evento: **hito declarado**.

No se exige on-chain que la evidencia de una re-declaración sea distinta de la anterior (cambiar un byte bastaría para eludirlo); el tablero muestra el historial de hashes.

### 3.4 `aprobar`

```rust
fn aprobar(env: Env, obra: u32, hito: u32, firmante: Address) -> Result<(), Error>
```

1. `ObraNoExiste`, `HitoNoExiste`.
2. `NoAutorizado` si `firmante` no es el inspector ni el veedor de la obra.
3. `firmante.require_auth()`.
4. `HitoAnteriorPendiente` si el hito anterior no está OK.
5. Según el estado: `Pagado` → `YaPagado`; `Objetado` → `ObjecionAbierta`; `Pendiente` → `EstadoInvalido`.
6. `YaDecidio` si es el inspector y `aprobo_inspector`, o si es el veedor y `aprobo_veedor`.

Efectos: marca la aprobación del rol. Si quedan las dos: estado `Aprobado`, `momento_aprobacion_completa = ahora`.
Sin límite de tiempo: el veedor puede aprobar aunque el período haya vencido (solo la objeción tiene plazo).
Evento: **hito aprobado**.

### 3.5 `objetar`

```rust
fn objetar(env: Env, obra: u32, hito: u32, motivo_hash: BytesN<32>) -> Result<(), Error>
```

1. `ObraNoExiste`, `HitoNoExiste`.
2. `obra.veedor.require_auth()`.
3. Según el estado: `Pagado` → `YaPagado`; `Objetado` → `ObjecionAbierta`; `Pendiente` → `EstadoInvalido`.
4. `ObjecionYaUsada` si `objecion_usada`.
5. `YaDecidio` si `aprobo_veedor`.
6. `FueraDePeriodo` si `ahora >= momento_declaracion + periodo_objecion`.

Efectos: estado `Objetado`; `objecion_usada = true`; `motivo_objecion_hash`.
Evento: **hito objetado**.

### 3.6 `resolver_objecion`

```rust
fn resolver_objecion(env: Env, obra: u32, hito: u32, decision: Decision) -> Result<(), Error>
```

1. `ObraNoExiste`, `HitoNoExiste`.
2. `obra.arbitro.require_auth()`.
3. `EstadoInvalido` si el hito no está `Objetado`.

Efectos:

- **Aceptar:** estado `Pendiente`; se limpian aprobaciones, `evidencia_hash`, `momento_declaracion`, `objecion_usada`, `motivo_objecion_hash`. El contratista debe re-declarar; la nueva declaración abre un período nuevo con una objeción disponible.
- **Rechazar:** `aprobo_veedor = true`, `veedor_por_arbitro = true`; `objecion_usada` sigue en `true`. Si `aprobo_inspector`: estado `Aprobado` y `momento_aprobacion_completa = ahora`; si no, estado `Evidencia`.

Evento: **objeción resuelta**.

### 3.7 `liberar_pago`

```rust
fn liberar_pago(env: Env, obra: u32, hito: u32) -> Result<(), Error>
```

Sin firma: cualquiera la puede llamar; el dinero siempre va al contratista de la obra.

1. `ObraNoExiste`, `HitoNoExiste`.
2. `YaPagado` si está `Pagado`.
3. `ObjecionAbierta` si está `Objetado`.
4. `HitoAnteriorPendiente` si el hito anterior no está OK.
5. `EstadoInvalido` si no está `Aprobado`.
6. `PeriodoNoCumplido` si `ahora < momento_declaracion + periodo_objecion`.
7. `FondosInsuficientes` si `fondeado − pagado < monto_vigente`.

Efectos: estado `Pagado`, `momento_pago = ahora`, `pagado += monto_vigente`; si todos los hitos quedaron pagados, obra `Finalizada`. Después, transferencia de `monto_vigente` del contrato al contratista.
Evento: **pago liberado**.

### 3.8 Lectura

```rust
fn ver_obra(env: Env, obra: u32) -> Result<Obra, Error>              // ObraNoExiste
fn ver_hito(env: Env, obra: u32, hito: u32) -> Result<Hito, Error>   // ObraNoExiste, HitoNoExiste
fn ver_hitos(env: Env, obra: u32) -> Result<Vec<Hito>, Error>        // reconstrucción del indexador
fn cantidad_obras(env: Env) -> u32                                   // último id asignado (0 si no hay obras)
```

### 3.9 Fuera del MVP (Fase 4)

`registrar_adenda(...)`: firma, validaciones y evento a definir en la Fase 4 sin romper este documento. Restricciones ya acordadas: solo cambia `monto_vigente` de hitos no pagados, `monto_original` nunca cambia, y `fondeado ≤ monto_vigente` de la obra tiene que seguir valiendo.

## 4. Eventos

**Mecanismo (confirmado en el SDK vigente):** se declaran con `#[contractevent]` y se publican con `Evento { .. }.publish(&env)`. `env.events().publish(...)` está **deprecado**. Si la invocación devuelve error, los eventos se descartan.

**Sobre los nombres cortos:** con `#[contractevent]` el nombre no pasa por `symbol_short!`. El primer topic es un `Symbol` de hasta **32** caracteres: o el nombre del struct en snake_case, o el que se fije con `topics = [...]`. El límite de 9 caracteres ya no es obligatorio. Igual se mantienen nombres de ≤ 9 caracteres, como pide la decisión del PRD v3, porque son más baratos en ejecución. Se fijan con `topics = ["..."]` para que los structs de Rust conserven nombres descriptivos.

**Formato:** topics = `[nombre, obra, hito?]`. Los datos van en un mapa con los nombres de campo indicados (formato por defecto, `data_format = "map"`). Los eventos no llevan campos `Option`, porque en formato mapa un campo vacío se omite.

| Struct (Rust) | Nombre on-chain | Topics después del nombre | Datos (mapa) |
|---|---|---|---|
| `ObraCreada` | `creada` | `obra: u32` | `nombre: String`, `municipio`, `contratista`, `inspector`, `veedor`, `arbitro`, `token: Address`, `monto_original: i128`, `cantidad_hitos: u32`, `periodo_objecion: u64` |
| `ObraFondeada` | `fondeada` | `obra: u32` | `monto: i128`, `fondeado: i128` (acumulado) |
| `HitoDeclarado` | `declarado` | `obra: u32`, `hito: u32` | `evidencia_hash: BytesN<32>`, `fin_periodo: u64` |
| `HitoAprobado` | `aprobado` | `obra: u32`, `hito: u32` | `firmante: Address`, `completo: bool` (quedaron las dos aprobaciones) |
| `HitoObjetado` | `objetado` | `obra: u32`, `hito: u32` | `motivo_hash: BytesN<32>` |
| `ObjecionResuelta` | `resuelta` | `obra: u32`, `hito: u32` | `decision: Decision`, `estado: EstadoHito` (estado resultante) |
| `PagoLiberado` | `pagado` | `obra: u32`, `hito: u32` | `contratista: Address`, `monto: i128`, `pagado: i128` (acumulado) |
| `AdendaRegistrada` *(Fase 4)* | `adenda` | `obra: u32`, `hito: u32` | a definir en la Fase 4 |

Ejemplo:

```rust
#[contractevent(topics = ["declarado"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HitoDeclarado {
    #[topic] pub obra: u32,
    #[topic] pub hito: u32,
    pub evidencia_hash: BytesN<32>,
    pub fin_periodo: u64,
}
// HitoDeclarado { obra, hito, evidencia_hash, fin_periodo }.publish(&env);
```

A-CONTRATO confirma en la Fase 0 que `topics = [...]` combinado con campos `#[topic]` compila con la 28.0.0 tal como está acá (está documentado en la rama principal del SDK; no lo verifiqué contra el tag 28.0.0).

**Lado del indexador:** filtra con `getEvents` por el id del contrato. La ventana de retención por defecto del RPC es de unos 7 días (120960 ledgers); la real de testnet se lee con `getHealth`.

## 5. Almacenamiento y TTL

```rust
#[contracttype]
pub enum Clave {
    UltimaObra,        // instance: u32, último id asignado
    Obra(u32),         // persistent: Obra
    Hito(u32, u32),    // persistent: Hito (obra, índice)
}
```

- **Persistent** para obras e hitos: al vencer el TTL se archivan y se pueden restaurar, nunca se pierden. **Temporary no se usa**, porque al vencer se borra para siempre.
- **Extensión de TTL:** cada función que escribe extiende el TTL de la instancia y de las entradas que toca, con `extend_ttl(threshold, extend_to)`. Los valores se cuentan en ledgers (≈ 5 s por ledger). Propuesta: `extend_to` ≈ 30 días (518 400 ledgers) y `threshold` a la mitad. **SUPUESTO:** los máximos de testnet no están verificados. Desde el Protocolo 29, un `extend_to` por encima del máximo se recorta en lugar de fallar. A-CONTRATO consulta los límites reales con `stellar network settings` en la Fase 0.
- **Alcance (v1.1):** se extienden la instancia, la obra y los hitos que la función **escribe**. Las entradas que solo se **leen** no se extienden: el hito anterior en el chequeo de orden y los hitos recorridos al finalizar la obra. Si alguna se archiva, el RPC la restaura automáticamente al simular.
- Las funciones de lectura que se llaman por simulación no extienden el TTL de forma persistente.
- **Restauración:** desde el Protocolo 23, una entrada archivada se restaura automáticamente si la simulación del RPC la incluye en la transacción. Riesgo §16 del PRD: probar en la Fase 0 que una lectura y una escritura sobre datos viejos funcionan.

## 6. Cobertura de pruebas (PRD §15)

| Prueba | Llamada | Error esperado |
|---|---|---|
| Cobrar sin las dos aprobaciones | `liberar_pago` en `Evidencia` | `EstadoInvalido` |
| Aprobar dos veces con la misma dirección | `aprobar` repetido | `YaDecidio` |
| Aprobar con dirección sin rol | `aprobar(firmante = otra)` | `NoAutorizado` |
| Saltear un hito | `declarar_hito` / `liberar_pago` del hito N+1 | `HitoAnteriorPendiente` |
| Pagar dos veces | `liberar_pago` repetido | `YaPagado` |
| Objetar fuera del período | `objetar` con `ahora >= fin` | `FueraDePeriodo` |
| Pagar con objeción abierta | `liberar_pago` en `Objetado` | `ObjecionAbierta` |
| Roles en la misma dirección | `crear_obra` | `RolesDuplicados` |
| Pagar más de lo fondeado | `liberar_pago` con saldo insuficiente | `FondosInsuficientes` |
| Pagar antes del fin del período | `liberar_pago` en `Aprobado` con `ahora < fin` | `PeriodoNoCumplido` |
| Veedor aprueba y luego objeta | `objetar` | `YaDecidio` |
| Veedor objeta otra vez tras un Rechazar | `objetar` | `ObjecionYaUsada` |
| Resolver sin ser árbitro | `resolver_objecion` firmado por otra cuenta | error de autorización del host |
| Fondear de más | `fondear` | `ExcedeMontoTotal` |

## 7. Fuentes consultadas

Consultadas el 15/10/2026.

- Versiones: https://crates.io/crates/soroban-sdk · https://github.com/stellar/rs-soroban-sdk/releases · https://developers.stellar.org/docs/networks/software-versions
- Toolchain y target: https://docs.rs/soroban-sdk/latest/soroban_sdk/ · https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup
- Eventos: https://docs.rs/soroban-sdk/latest/soroban_sdk/attr.contractevent.html · https://docs.rs/soroban-sdk/latest/soroban_sdk/events/struct.Events.html · https://developers.stellar.org/docs/build/smart-contracts/example-contracts/events
- Errores: https://docs.rs/soroban-sdk/latest/soroban_sdk/attr.contracterror.html · https://developers.stellar.org/docs/build/smart-contracts/example-contracts/errors
- Firmas: https://docs.rs/soroban-sdk/latest/soroban_sdk/struct.Address.html · https://developers.stellar.org/docs/build/smart-contracts/example-contracts/auth
- Tiempo: https://docs.rs/soroban-sdk/latest/soroban_sdk/ledger/struct.Ledger.html
- Almacenamiento: https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival · https://docs.rs/soroban-sdk/latest/soroban_sdk/storage/struct.Persistent.html
- Token: https://docs.rs/soroban-sdk/latest/soroban_sdk/token/struct.TokenClient.html · https://developers.stellar.org/docs/tokens/stellar-asset-contract
- Eventos por RPC: https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents

**No verificado:** límites de TTL de testnet; la combinación `topics` + `#[topic]` en el tag 28.0.0; la ventana de retención real del RPC de testnet.

**Llamadas desde el contrato al token:** `TokenClient::new(&env, &obra.token).transfer(&desde, &hacia, &monto)`, con monto `i128` por referencia. La dirección del contrato **no necesita trustline** para tener saldo del activo (el SAC lo guarda en su propio almacenamiento).
