# contracts/DEPLOY.md

Registro de los despliegues en testnet (16/10/2026):

- **Contrato completo (Fase 2): el vigente.** Es el que usan el backend y el frontend.
- **Hola mundo (Fase 0):** solo histórico. El código de `hola`, `ping` y `EventoPrueba` se sacó en la Fase 1; el contrato desplegado corresponde a los commits `b0430a8`–`b80f6d8` y sigue en testnet con ese código.

Lo no verificado está marcado **SUPUESTO**; los datos de ejemplo, **DATO SIMULADO**. Solo hay direcciones públicas: las claves quedan en el almacén de la CLI (`~/.config/stellar/identity/`), fuera del repo.

## Red y versiones

| | Valor |
|---|---|
| Red | Stellar **testnet** (`Test SDF Network ; September 2015`), protocolo 29 |
| RPC | `https://soroban-testnet.stellar.org/` (config por defecto de la CLI) |
| rustc | `1.99.1 (58cf8f9c3 2026-10-13)`, host `x86_64-pc-windows-gnu` |
| Target | `wasm32v1-none` |
| Stellar CLI | `stellar 28.1.0 (c0f4d0da891bbf214c08b8c5035ae6db80e9a3bd)`, stellar-xdr 28.0.0 |
| soroban-sdk | `28.0.0` (fijado en `Cargo.lock`) |
| rustfmt | `1.10.0-stable` (desde la Fase 2; `cargo fmt` antes de cada commit) |

## Contrato completo (Fase 2) — vigente

| | Valor |
|---|---|
| Código | `interfaces/contract.md` v1.0 completo, salvo `registrar_adenda` (Fase 4). Commit del contrato: `c2fdcf9`. |
| Funciones | `crear_obra`, `fondear`, `declarar_hito`, `aprobar`, `objetar`, `resolver_objecion`, `liberar_pago`, `ver_obra`, `ver_hito`, `ver_hitos`, `cantidad_obras` |
| Wasm hash | `f2daa0a303505fbc2c24b40b9d5fc97bd5a46323b0deb476d6ba2da45778a7ef` (18 761 bytes) |
| **Id del contrato** | **`CCRFFXP25OT5FOI3VJXAX666QI76YWHV52IYTG45ICK4TMB7QFS7KYSM`** (alias local `obra_publica`) |
| Desplegado por | `deployer` = `GDV6CVVLOADKLD2XXLE5SSKCTTJBUHFTPHIBKX7A5AJZQUUMJ4U3HMBB` |
| Upload del wasm | tx `b8d2cc95077169888cda7f3c099d0292500b03fb2eed0a6140757cf0cc455d6c`, ledger 5220080 |
| Creación del contrato | tx `253e50c7625e9a251b2732e0e2900fc05d5b757f76cee4e0feb0140129e36dc2`, **ledger 5220081** |
| **`startLedger` del indexador** | **5220081**: el contrato no puede tener eventos antes de su creación |
| TTL de la instancia | `liveUntilLedgerSeq` 5738488 = 5220088 + 518 400. `crear_obra` la extendió, lo que confirma `EXTEND_TO` on-chain; vence ≈ 15/11/2026 si nada escribe antes. |

`cargo test` sobre `347d9a3`: `test result: ok. 156 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out`.

```console
$ stellar contract build
   Wasm Hash: f2daa0a303505fbc2c24b40b9d5fc97bd5a46323b0deb476d6ba2da45778a7ef
   Wasm Size: 18761 bytes optimized (original size was 20960 bytes)
   Exported Functions: 11 found

$ stellar contract deploy --wasm target/wasm32v1-none/release/obra_publica.wasm \
    --source-account deployer --network testnet --alias obra_publica
ℹ️ Uploading contract WASM…
🔗 https://stellar.expert/explorer/testnet/tx/b8d2cc95077169888cda7f3c099d0292500b03fb2eed0a6140757cf0cc455d6c
ℹ️ Deploying contract using wasm hash f2daa0a303505fbc2c24b40b9d5fc97bd5a46323b0deb476d6ba2da45778a7ef
🔗 https://stellar.expert/explorer/testnet/tx/253e50c7625e9a251b2732e0e2900fc05d5b757f76cee4e0feb0140129e36dc2
✅ Deployed!
CCRFFXP25OT5FOI3VJXAX666QI76YWHV52IYTG45ICK4TMB7QFS7KYSM
```

El ledger de cada tx sale del método `getTransaction` del RPC:

```console
$ curl -s -X POST https://soroban-testnet.stellar.org -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getTransaction","params":{"hash":"253e50c7…6dc2"}}'
… "status":"SUCCESS" … "ledger":5220081 … "createdAt":"1792123992" …
```

### Argumentos por CLI

Los muestra `stellar contract invoke --id obra_publica --network testnet -- <función> --help`.

| Tipo | Formato en la CLI |
|---|---|
| `i128` | Texto JSON: `"100000000000"` |
| `Vec<NuevoHito>` | `'[{"descripcion":"…","monto":"…"}]'` |
| `BytesN<32>` | Hex sin `0x` |
| `Address` | G…, C… o alias de identidad |
| `String` | Texto plano |

Las funciones que devuelven `()` imprimen `null`. Las de lectura se simulan sin enviar transacción.

### Corrida de humo (`scripts/humo-testnet.sh`)

```console
$ contracts/scripts/humo-testnet.sh obra_publica
```

Crea la obra de la demo, la fondea y paga el hito 0, como en el paso 2 del PRD §4. Verifica que el contratista cobre exactamente el monto del hito y termina con error si no. Cada corrida crea una obra nueva y usa 40 000 USDCDEMO del municipio; `setup-testnet.sh` repone el saldo (se comprobó después de esta corrida, que emitió justo los 40 000 que faltaban).

Datos de la obra (**DATO SIMULADO**):

- nombre "Pavimentación calle Los Aromos";
- hitos de 10 000 / 15 000 / 10 000 / 5 000 USDCDEMO (×10⁷ en stroops);
- `periodo_objecion` 60 s;
- árbitro = municipio;
- token = SAC USDCDEMO.

Resultado del 16/10/2026, **obra 1**:

| Paso | Firma | Tx | Ledger | Evento del contrato |
|---|---|---|---|---|
| `crear_obra` → `1` | municipio | `c6b4920877292c4e19dc87745d2c75bb0dd74c0322a3d72cb87fd7e079cda982` | 5220088 | `creada` |
| `fondear` 400 000 000 000 | municipio | `3368df72fdc6a9fa950275726175eb811caa6180315a1a313b133dbe58665f2a` | 5220089 | `fondeada` (+ `transfer` del SAC) |
| `declarar_hito` 0 | contratista | `50a50526446ca27bf9b0ae0e0c170158c39b806aa6c14fa669da8a3c429d4f9d` | 5220090 | `declarado`, `fin_periodo` 1792124097 |
| `aprobar` 0 | inspector | `3fd86d65a2aac1fdeae5cdb4eca7ec5165bb263b5c3ee1dfb30d8496e11e0fab` | 5220094 | `aprobado`, `completo: false` |
| `aprobar` 0 | veedor | `768d3b6e2e80f22d93760733384bb74ada68c380bbab295123dcf9dceb5ec356` | 5220096 | `aprobado`, `completo: true` |
| `liberar_pago` 0 (tras 60 s) | contratista (no hace falta firma de rol) | `0b542fd4d7e49e524274f2a7ee7fde8415e3b02e156e8c4fb7aaf758a8187a99` | 5220112 | `pagado` (+ `transfer` del SAC) |

Evidencia del hito 0: `sha256("Foto de ejemplo del hito 0 (DATO SIMULADO)")` = `5071abaf0534578c02f6cfee9396fb3e90ca2879c6259944d95367309772078a`.

Salida final (recortada):

```console
=== Obra 1 ===
{"arbitro":"GCTYV7VG…SSNQ3","cantidad_hitos":4,"contratista":"GCDMFX7P…VSNE","creada_en":1792124027,"estado":"Activa","fondeado":"400000000000","id":1,…,"nombre":"Pavimentación calle Los Aromos","pagado":"100000000000","periodo_objecion":60,"token":"CAKGWGZQ…TA2QK",…}
=== Hito 0 ===
{"aprobo_inspector":true,"aprobo_veedor":true,"descripcion":"Movimiento de suelo","estado":"Pagado","evidencia_hash":"5071abaf…078a","indice":0,"momento_aprobacion_completa":1792124067,"momento_declaracion":1792124037,"momento_pago":1792124147,"monto_original":"100000000000","monto_vigente":"100000000000","motivo_objecion_hash":null,"objecion_usada":false,"veedor_por_arbitro":false}
=== Eventos del contrato desde el ledger 5220086 ===
{"ledger":5220088,…,"event_name":"ObraCreada","prefix_topics":["creada"],"params":{"obra":1,"nombre":"Pavimentación calle Los Aromos",…,"monto_original":"400000000000","cantidad_hitos":4,"periodo_objecion":60}}
{"ledger":5220089,…,"event_name":"ObraFondeada","prefix_topics":["fondeada"],"params":{"obra":1,"monto":"400000000000","fondeado":"400000000000"}}
{"ledger":5220090,…,"event_name":"HitoDeclarado","prefix_topics":["declarado"],"params":{"obra":1,"hito":0,"evidencia_hash":"5071abaf…078a","fin_periodo":1792124097}}
{"ledger":5220094,…,"event_name":"HitoAprobado","prefix_topics":["aprobado"],"params":{"obra":1,"hito":0,"firmante":"GDWCJEK5…HSHGV","completo":false}}
{"ledger":5220096,…,"event_name":"HitoAprobado","prefix_topics":["aprobado"],"params":{"obra":1,"hito":0,"firmante":"GDHICN4U…C7KI","completo":true}}
{"ledger":5220112,…,"event_name":"PagoLiberado","prefix_topics":["pagado"],"params":{"obra":1,"hito":0,"contratista":"GCDMFX7P…VSNE","monto":"100000000000","pagado":"100000000000"}}

contratista: 0 → 100000000000 stroops (cobró 100000000000 = 10000 USDCDEMO)
```

Estado que quedó en la red:

- **Obra 1** (DATO SIMULADO): hito 0 `Pagado`; hitos 1–3 `Pendiente`. El contrato retiene 300 000 000 000 stroops (30 000 USDCDEMO) de la obra 1.
- **Contratista:** 10 000 USDCDEMO.
- **Municipio:** 100 000 USDCDEMO, después de que `setup-testnet.sh` repuso el saldo.

En la corrida de humo no se probaron objeción ni resolución en testnet: están cubiertas por las pruebas unitarias, incluida la demo del PRD §4 en `src/test/demo.rs`.

**Para el backend:** un enum `contracttype` de variantes unitarias (`Decision`, `EstadoHito`, `EstadoObra`) se codifica on-chain como un Vec de un elemento con el nombre de la variante como `Symbol`, por ejemplo `Vec[Symbol("Aprobado")]`. Fuente: docs de `contracttype` en soroban-sdk 28.0.0, `src/lib.rs`. Lo verifica `src/test/eventos_objecion.rs`. La CLI lo muestra como texto (`"estado":"Activa"`).

## Contrato "hola mundo" (Fase 0, histórico)

| | Valor |
|---|---|
| Crate | `obra-publica` → `target/wasm32v1-none/release/obra_publica.wasm` |
| Funciones | `hola(nombre: String) -> String`, `ping(obra: u32, hito: u32)` |
| Wasm hash | `8fc34932562582da2fae27a29e7e0338322048d52a2d04547eaad3b2bcbe12c7` (1296 bytes) |
| **Id del contrato** | **`CBONF4WIJOT576OZNBLF23NTAOQ6OSZ5R6NSWFLOFGIF4ZTZ67EX65MI`** (alias local `hola_mundo`) |
| Desplegado por | `deployer` = `GDV6CVVLOADKLD2XXLE5SSKCTTJBUHFTPHIBKX7A5AJZQUUMJ4U3HMBB` (fondeada con friendbot) |
| TTL de la instancia | `liveUntilLedgerSeq` 5340619 (= mínimo persistente desde el ledger 5219660, ≈ 23/10/2026). Este contrato no extiende su TTL. |

### Build y pruebas

Desde `contracts/`:

```console
$ stellar contract build
    Finished `release` profile [optimized] target(s) in 1m 21s
ℹ️ Build Summary:
   Wasm File: target\wasm32v1-none\release\obra_publica.wasm (1296 bytes optimized (original size was 1358 bytes))
   Wasm Hash: 8fc34932562582da2fae27a29e7e0338322048d52a2d04547eaad3b2bcbe12c7
   Exported Functions: 2 found
     • hola
     • ping
✅ Build Complete

$ cargo test
running 5 tests
test test::hola_saluda_con_nombre ... ok
test test::hola_con_nombre_vacio ... ok
test test::ping_con_u32_max_no_hace_panic_y_envuelve ... ok
test test::ping_publica_topics_y_datos_on_chain ... ok
test test::ping_publica_evento_prueba_tipado ... ok

test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

`stellar contract info interface --wasm target/wasm32v1-none/release/obra_publica.wasm` muestra el evento en la especificación del contrato:

```rust
#[soroban_sdk::contractevent(topics = ["prueba"])]
pub struct EventoPrueba {
    #[topic]
    pub obra: u32,
    #[topic]
    pub hito: u32,
    pub valor: u32,
}
```

### Deploy

```console
$ stellar keys generate deployer --network testnet --fund
✅ Key saved with alias deployer in "C:\\Users\\nacho\\.config\\stellar\\identity\\deployer.toml"
✅ Account deployer funded on "Test SDF Network ; September 2015"

$ stellar contract deploy --wasm target/wasm32v1-none/release/obra_publica.wasm \
    --source-account deployer --network testnet --alias hola_mundo
ℹ️ Uploading contract WASM…
🔗 https://stellar.expert/explorer/testnet/tx/7ef8ae0e5d40564f83a09e094e0c7beffeb02a18e95ea765b37b67b78113ecb8
ℹ️ Deploying contract using wasm hash 8fc34932562582da2fae27a29e7e0338322048d52a2d04547eaad3b2bcbe12c7
🔗 https://stellar.expert/explorer/testnet/tx/5ee36a49f576cba1456c769759d856c2effaca35515d2369de985baab109e6f7
✅ Deployed!
CBONF4WIJOT576OZNBLF23NTAOQ6OSZ5R6NSWFLOFGIF4ZTZ67EX65MI
```

### Invocaciones

`hola` es de solo lectura: sin `--send=yes` la CLI solo la simula y no envía la transacción.

```console
$ stellar contract invoke --id hola_mundo --source-account deployer --network testnet -- hola --nombre Mundo
ℹ️ Simulation identified as read-only. Send by rerunning with `--send=yes`.
"Hola, Mundo"

$ stellar contract invoke --id hola_mundo --source-account deployer --network testnet --send=yes -- hola --nombre Mundo
🔗 https://stellar.expert/explorer/testnet/tx/36e6a3b33af6a7720bfc36d37b052e06dfb34d6b3ed271196ec964caf96a4140
"Hola, Mundo"

$ stellar contract invoke --id hola_mundo --source-account deployer --network testnet -- ping --obra 7 --hito 3
🔗 https://stellar.expert/explorer/testnet/tx/2576994b94a1c5bae2ac1efab6a0f1fe42e83011109e8d50f18a942c94f7682d
📅 CBONF4WIJOT576OZNBLF23NTAOQ6OSZ5R6NSWFLOFGIF4ZTZ67EX65MI - Success - Event: EventoPrueba (prueba), obra: 7, hito: 3, valor: 10
```

Para verificarlo desde otra máquina basta el id: `stellar contract invoke --id CBONF4WIJOT576OZNBLF23NTAOQ6OSZ5R6NSWFLOFGIF4ZTZ67EX65MI --source-account <cualquier identidad> --network testnet -- hola --nombre Mundo`.

### Evento de prueba en la red

Se consultó con `stellar events` (usa `getEvents` del RPC), filtrando por el id del contrato:

```console
$ stellar events --network testnet --start-ledger 5219500 --id CBONF4WIJOT576OZNBLF23NTAOQ6OSZ5R6NSWFLOFGIF4ZTZ67EX65MI --output json
{"id":"0022418311945961472-0000000000","ledger":5219670,"ledger_closed_at":"2026-10-16T03:38:57Z","type":"contract","contract_id":"CBONF4WIJOT576OZNBLF23NTAOQ6OSZ5R6NSWFLOFGIF4ZTZ67EX65MI","event_name":"EventoPrueba","prefix_topics":["prueba"],"params":{"obra":7,"hito":3,"valor":10}}

$ stellar events --network testnet --start-ledger 5219500 --id CBONF4WIJOT576OZNBLF23NTAOQ6OSZ5R6NSWFLOFGIF4ZTZ67EX65MI --output raw
Event 0022418311945961472-0000000000 [CONTRACT]:
  Ledger:   5219670 (closed at 2026-10-16T03:38:57Z)
  Contract: CBONF4WIJOT576OZNBLF23NTAOQ6OSZ5R6NSWFLOFGIF4ZTZ67EX65MI
  Topics:
            Symbol(ScSymbol(StringM(prueba)))
            U32(7)
            U32(3)
  Value: Map(Some(ScMap(VecM([ScMapEntry { key: Symbol(ScSymbol(StringM(valor))), val: U32(10) }]))))
```

Formato on-chain confirmado: topics = `[Symbol("prueba"), U32(obra), U32(hito)]`, datos = mapa `{ valor }`. Es el formato que `interfaces/contract.md` §4 fija para los eventos de la Fase 1. El evento deja de estar en el RPC cuando sale de la ventana de retención (ver abajo).

## Límites de la red (testnet)

```console
$ stellar network settings --network testnet --output json-formatted
      "state_archival": {
        "max_entry_ttl": 3110400,
        "min_temporary_ttl": 720,
        "min_persistent_ttl": 120960,
        ...
      "scp_timing": {
        "ledger_target_close_time_milliseconds": 5000,
```

| Límite | Ledgers | ≈ tiempo (5 s por ledger) |
|---|---|---|
| TTL máximo de cualquier entrada (`max_entry_ttl`), incluidas persistentes e instancia | 3 110 400 | 180 días |
| TTL mínimo de una entrada persistente o de instancia (`min_persistent_ttl`) | 120 960 | 7 días |
| TTL mínimo de una entrada temporaria (`min_temporary_ttl`) | 720 | 1 hora |

La instancia del contrato es una entrada persistente, así que usa los mismos límites que las entradas persistentes.

**Propuesta de `interfaces/contract.md` §5:** `extend_to` = 518 400 ledgers (30 días) y `threshold` = 259 200. **Entra** con margen: 518 400 < 3 110 400, y queda por encima del mínimo de 120 960. No hace falta cambiarla. **SUPUESTO** (no probado): que un `extend_to` por encima del máximo se recorte en lugar de fallar (contract.md §5); con 518 400 no aplica.

Retención de eventos del RPC de testnet (`getHealth`, contract.md §4):

```console
$ curl -s -X POST https://soroban-testnet.stellar.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
{"jsonrpc":"2.0","id":1,"result":{"status":"healthy","latestLedger":5219681,"latestLedgerCloseTime":"1792121992","oldestLedger":5098722,"oldestLedgerCloseTime":"1791517197","ledgerRetentionWindow":120960}}
```

`ledgerRetentionWindow` = 120 960 ledgers ≈ 7 días (604 795 s entre el ledger más viejo y el último). Coincide con el valor por defecto que asume contract.md §4.

## Cuentas y activo de prueba (`scripts/setup-testnet.sh`)

```console
$ contracts/scripts/setup-testnet.sh          # ASSET_CODE=USDCDEMO, MINT_AMOUNT=100000 por defecto
```

| Identidad (alias CLI) | Dirección pública |
|---|---|
| `municipio` (también árbitro en el MVP) | `GCTYV7VGW23P4R3MF5YXHCIM6JWK3COGOYUBCKUZMDG7OVP6JT5SSNQ3` |
| `contratista` | `GCDMFX7PNUVK3ISYSZ37SO4EIM2NJKBYSD6KGMDR6YKIABUMDH77VSNE` |
| `inspector` | `GDWCJEK5PDWPBKGOMJDXALNASP4LFLAKYO7EPRTD6LEAIFLYPL7HSHGV` |
| `veedor` | `GDHICN4U7AZZTCLMJMGDPS6CCQD2HRSQ6AMMMCYVLK2NY5CPCOTHC7KI` |
| `emisor` | `GC2MHNIBGSGSOWVONYJ3IBHHGBOA4GADG6Q7AOXWECQRCP5W5DQ72BOK` |
| `deployer` (solo para el hola mundo) | `GDV6CVVLOADKLD2XXLE5SSKCTTJBUHFTPHIBKX7A5AJZQUUMJ4U3HMBB` |

| Activo | Valor |
|---|---|
| Código | `USDCDEMO` (**DATO SIMULADO**) |
| Emisor | `GC2MHNIBGSGSOWVONYJ3IBHHGBOA4GADG6Q7AOXWECQRCP5W5DQ72BOK` |
| **Id del SAC** | **`CAKGWGZQI6XOF6XAP2BB2DM6DQP525ETKYDT5UHSYBF2XRA6JUITA2QK`** (alias local `usdcdemo`) |
| Trustlines | `municipio` y `contratista`. Inspector, veedor y el contrato no la necesitan. |
| Saldo del municipio | 100 000.0000000 USDCDEMO = 1 000 000 000 000 stroops (**DATO SIMULADO**) |

El saldo se emitió con `stellar tx new payment --source-account emisor --destination <municipio> --asset USDCDEMO:<emisor> --amount <stroops>`: `payment` acepta `CODIGO:EMISOR` y el pago desde la cuenta emisora crea las unidades, así que no hizo falta `mint` del SAC. El script lee el saldo con `balance` del SAC (simulación) y solo emite lo que falta para llegar a `MINT_AMOUNT`.

Cómo es idempotente: cada paso consulta antes de actuar (`stellar keys address`, `stellar ledger entry fetch account | trustline | contract-data --instance`, `balance` del SAC). Si una identidad ya existe pero su cuenta no está en la red, por ejemplo tras un reinicio de testnet, la refondea con `stellar keys fund`.

Primera corrida (resumida: se omiten las líneas de firma y los enlaces):

```console
==> creando y fondeando identidad municipio
✅ Account municipio funded on "Test SDF Network ; September 2015"
...                                        (ídem contratista, inspector, veedor, emisor)
==> activo: USDCDEMO:GC2MHNIBGSGSOWVONYJ3IBHHGBOA4GADG6Q7AOXWECQRCP5W5DQ72BOK
==> creando trustline de municipio con USDCDEMO
==> creando trustline de contratista con USDCDEMO
==> desplegando el SAC de USDCDEMO
🔗 https://stellar.expert/explorer/testnet/tx/447f2a83cab98fa00eaf170122b78874feeea420f968edae7ef75cd87c9316ad
✅ Deployed!
✅ Contract alias 'usdcdemo' has been added
==> emitiendo 100000.0000000 USDCDEMO al municipio
ℹ️ Signing transaction: 6f16ef2379b290e4fdc3bad1e2086e7c188e1faf3df9bd52635d170c66a8fa3e
...
saldo mun.   100000.0000000 USDCDEMO (1000000000000 stroops)
exit=0
```

Segunda corrida, inmediatamente después:

```console
==> identidad municipio: ya existe y está fondeada
==> identidad contratista: ya existe y está fondeada
==> identidad inspector: ya existe y está fondeada
==> identidad veedor: ya existe y está fondeada
==> identidad emisor: ya existe y está fondeada
==> activo: USDCDEMO:GC2MHNIBGSGSOWVONYJ3IBHHGBOA4GADG6Q7AOXWECQRCP5W5DQ72BOK
==> trustline de municipio con USDCDEMO: ya existe
==> trustline de contratista con USDCDEMO: ya existe
==> SAC de USDCDEMO: ya desplegado
✅ Contract alias 'usdcdemo' has been added
==> el municipio ya tiene 100000.0000000 USDCDEMO (>= 100000): no se emite

=== Resumen (testnet) ===
municipio    GCTYV7VGW23P4R3MF5YXHCIM6JWK3COGOYUBCKUZMDG7OVP6JT5SSNQ3
contratista  GCDMFX7PNUVK3ISYSZ37SO4EIM2NJKBYSD6KGMDR6YKIABUMDH77VSNE
inspector    GDWCJEK5PDWPBKGOMJDXALNASP4LFLAKYO7EPRTD6LEAIFLYPL7HSHGV
veedor       GDHICN4U7AZZTCLMJMGDPS6CCQD2HRSQ6AMMMCYVLK2NY5CPCOTHC7KI
emisor       GC2MHNIBGSGSOWVONYJ3IBHHGBOA4GADG6Q7AOXWECQRCP5W5DQ72BOK
(el municipio es también el árbitro en el MVP)
activo       USDCDEMO
emisor       GC2MHNIBGSGSOWVONYJ3IBHHGBOA4GADG6Q7AOXWECQRCP5W5DQ72BOK
SAC          CAKGWGZQI6XOF6XAP2BB2DM6DQP525ETKYDT5UHSYBF2XRA6JUITA2QK (alias usdcdemo)
saldo mun.   100000.0000000 USDCDEMO (1000000000000 stroops)
exit=0
```

## Pendiente o no verificado

- **SUPUESTO:** restauración automática de entradas archivadas (contract.md §5, riesgo §16 del PRD). No se probó en la Fase 0: hay que esperar a que una entrada venza. La instancia del hola mundo vence cerca del ledger 5340619 (≈ 23/10/2026); invocar `hola` después de esa fecha sirve de prueba.
- Las identidades y sus claves están solo en la máquina donde corrió el script. En otra máquina hay que correrlo de nuevo, y eso crea otras cuentas y otro activo: el emisor cambia, y con él el id del SAC.
- **Riesgo aceptado:** `setup-testnet.sh` se probó solo con Git Bash 5.2 en Windows. No se probó con bash 3.2 (el de macOS), ni en WSL ni en Linux.
- Testnet se reinicia periódicamente. Después de un reinicio, el contrato, el SAC y los saldos desaparecen y hay que repetir el despliegue y el script.
