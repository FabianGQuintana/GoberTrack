# Backend — Obra Pública Verificable

API de lectura del estado del contrato + subida de evidencia, según `interfaces/openapi.yaml`
v1.0.0. Dos modos de datos (`MODO_DATOS`):

- **`seed`** (por defecto, Fase 1): datos simulados de `npm run seed`.
- **`testnet`** (Fase 3): un indexador lee el contrato desplegado en testnet; no se siembra nada.

El backend no firma ni paga nada.

## Correrlo

Requiere Node ≥ 22.18 (ejecuta TypeScript directo y trae `node:sqlite`; no compila nada nativo).

```sh
cd backend
npm install

# Datos simulados
npm run seed          # DATO SIMULADO: 5 obras con su línea de tiempo y 11 archivos de evidencia
npm run dev           # http://localhost:3001, recarga al guardar

# Contrato real en testnet (lee testnet.env)
npm run dev:testnet   # http://localhost:3001; el indexador se pone al día en unos segundos
```

| Script | Qué hace |
|---|---|
| `npm run dev` / `npm run dev:testnet` | Servidor con `--watch` sobre `src/`, en modo seed o testnet |
| `npm run build` + `npm start` / `npm run start:testnet` | Compila a `dist/` y lo sirve |
| `npm run seed` | Reemplaza obras, hitos y eventos por el escenario simulado (no borra evidencias subidas; en modo testnet se niega) |
| `npm run fixtures:testnet` | Vuelve a grabar respuestas reales del RPC en `test/fixtures/testnet/` |
| `npm test` | Chequeo de tipos + pruebas (`node:test`); cada respuesta se valida contra el OpenAPI. Con `OPV_PRUEBA_TESTNET=1` corre además la prueba en vivo contra testnet |

Variables de entorno (las de testnet están en `testnet.env`; las del entorno tienen prioridad):

| Variable | Por defecto |
|---|---|
| `MODO_DATOS` | `seed` (o `testnet`) |
| `PORT` | `3001` |
| `HOST` | `localhost` |
| `CORS_ORIGIN` | `http://localhost:3000` (lista separada por comas) |
| `DB_PATH` | `backend/data/opv.sqlite` en seed, `backend/data/opv-testnet.sqlite` en testnet |
| `EVIDENCIA_DIR` | `backend/data/evidencia` |
| `LOG_LEVEL` | `info` |
| `CONTRATO_ID` | obligatoria en testnet (C…) |
| `START_LEDGER` | obligatoria en testnet: ledger de creación del contrato |
| `RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NETWORK_PASSPHRASE` | `Networks.TESTNET` del SDK |
| `POLL_MS` | `5000` |

`backend/data/` está ignorado por git.

## Indexador (modo testnet)

Código en `src/indexador/`. En cada pasada:

1. Pide a `getEvents` los eventos del contrato desde el cursor guardado en `indexador_estado` o,
   la primera vez, desde `START_LEDGER`. Si ese ledger o el cursor ya salieron de la ventana de
   retención del RPC (≈ 7 días), arranca desde el más viejo disponible y lo deja en el log.
2. Traduce cada evento (nombre corto de `contract.md` §4 → `tipo`; datos al mismo formato que el
   seed) y lo guarda. Es idempotente: re-indexar un id no lo duplica.
3. Relee el estado con `ver_obra` y `ver_hitos` por simulación de solo lectura: todas las obras
   (según `cantidad_obras`) al arrancar y después solo las que recibieron eventos. El estado no
   depende de la retención de eventos.
4. Guarda eventos, estado y cursor en una sola transacción.

Ante un error del RPC reintenta con espera creciente (hasta 60 s) sin tirar el proceso. Si el
contrato se redespliega, se cambian `CONTRATO_ID` y `START_LEDGER` en `testnet.env`: al arrancar
con otro contrato, el indexador descarta lo indexado y empieza de cero.

Formato on-chain que decodifica (verificado contra testnet): structs y datos de eventos como mapa
con claves Symbol; enums como `Vec[Symbol("Variante")]`; `Option` vacío como `Void`; i128 y u64
como enteros grandes (sin perder precisión). La evidencia de las obras reales no está en el
backend salvo que se haya subido con `POST /evidencia`.

## Endpoints

`GET /obras`, `/obras/{id}`, `/obras/{id}/hitos`, `/obras/{id}/eventos?desde=<id>`,
`/obras/{id}/alertas` (devuelve `[]` hasta la Fase 4), `POST /evidencia` (multipart, campo
`archivo`), `GET /evidencia/{sha256}`. Errores: `{ "error": { "codigo", "mensaje" } }`.

```sh
curl http://localhost:3001/obras/1/hitos
curl -F "archivo=@foto.jpg" http://localhost:3001/evidencia
```

## Decisiones

- **Montos** i128 guardados como texto y operados con `BigInt`; **momentos** como segundos Unix
  del ledger, expuestos en ISO 8601 UTC.
- **Calculados al responder, no guardados:** `saldo`, `estado` de la obra (Finalizada si todos
  los hitos están Pagado), `hitos_pagados`, `fin_periodo_objecion` y `pagable` (Aprobado,
  `ahora ≥ fin` y saldo ≥ monto vigente). En modo testnet, el "ahora" de `pagable` es el cierre
  del último ledger que vio el indexador (o el reloj de la máquina menos 10 s si todavía no hay
  ninguno), para que no pase a `true` antes de que el contrato acepte `liberar_pago`.
- **Momentos saturados:** como el `saturating_add` del contrato, `fin_periodo_objecion` y todos
  los momentos y períodos se acotan a `9999-12-31T23:59:59Z` (253 402 300 799 s). Una obra
  creada con un `periodo_objecion` enorme se indexa con el valor acotado y no rompe `GET /obras`.
- **Id de obra inválido** (`abc`, `0`, fuera de u32): 404 `ObraNoExiste`, porque el OpenAPI solo
  documenta 200 y 404.
- **`?desde=`**: devuelve los eventos con id mayor (comparación de texto; los ids del RPC tienen
  ancho fijo y ordenan en el tiempo).
- **Evidencia:** el tipo se detecta por la firma de los bytes (JPEG, PNG, PDF), no por el nombre ni
  el mimetype declarado. Máximo 10 MiB (SUPUESTO). Se guarda como `<EVIDENCIA_DIR>/<sha256>` con
  escritura atómica. Subir el mismo contenido otra vez devuelve 201 con los datos de la primera
  subida. Códigos: 400 `ArchivoFaltante`/`ArchivoVacio`, 413 `ArchivoMuyGrande`, 415
  `TipoNoPermitido` (también si la solicitud no es multipart). La descarga sale como
  `application/octet-stream` con el nombre original en `Content-Disposition`.
- **`datos` de los eventos:** nombres de `interfaces/contract.md` §4; montos como string, hashes en
  hex, `periodo_objecion` en segundos y `fin_periodo` en ISO 8601.

## Limitaciones

- **`POST /evidencia` sin tope de disco ni límite de pedidos.** Está abierto, como dice el
  OpenAPI, y por defecto escucha solo en `localhost`. Cualquiera que llegue al puerto podría subir
  archivos distintos de hasta 10 MiB sin fin. Antes de exponerlo fuera de `localhost` habría que
  agregar un límite de pedidos (p. ej. `@fastify/rate-limit`) y un tope de bytes por IP o total.

## Estructura

```
src/
  app.ts            crearApp(): Fastify + CORS + multipart + rutas (sin abrir el puerto)
  server.ts         arranque con la configuración de entorno
  db/               esquema SQLite (migraciones con PRAGMA user_version) y repositorio
  dominio/          tipos y conversión a respuestas de la API (campos calculados)
  http/             rutas y manejo de errores
  evidencia/        detección de tipo, hash y guardado en disco
  indexador/        cliente del RPC, decodificación de ScVal y eventos, polling
  seed/             DATO SIMULADO: simulador del contrato, escenario y archivos de ejemplo
scripts/            captura de fixtures reales de testnet
test/               pruebas + validador contra interfaces/openapi.yaml
  fixtures/testnet/ respuestas crudas grabadas del RPC (getEvents, getHealth, simulateTransaction)
testnet.env         configuración del modo testnet (contrato, ledger inicial, RPC)
```

### SQLite

`obras` e `hitos` copian el estado de `ver_obra` / `ver_hitos` con los mismos nombres de campo;
`eventos` guarda lo que devuelve `getEvents` ya traducido (`tipo` legible, `datos` en JSON);
`evidencias` guarda los metadatos de cada archivo; `indexador_estado` guarda el contrato
indexado, el cursor de eventos y el último ledger. El indexador escribe con las mismas funciones
que usa el seed (`guardarObra`, `guardarHito`, `guardarEvento`), así que la API es la misma en
los dos modos.

## Datos simulados

`npm run seed` corre un simulador en memoria del contrato (`src/seed/simulador.ts`), que aplica
las validaciones de `contract.md` §3 en el mismo orden y emite sus eventos. Por eso cada estado
viene explicado por su línea de tiempo. La línea de tiempo termina en el momento en que se corre
el seed. **Todo es DATO SIMULADO:** obras, montos, cuentas (direcciones G… y C… válidas,
generadas con el SDK de Stellar), ledgers, hashes de transacción y archivos de evidencia.

| Obra | Estado |
|---|---|
| 1 · Pavimentación calle Los Aromos | Fondeo parcial (25 000 de 40 000). Hito 1 Pagado; hito 2 Objetado (el inspector aprobó y el veedor objetó dentro del período); hitos 3 y 4 Pendiente. Período de 1 minuto. |
| 2 · Red de agua potable barrio Esperanza | Sin fondos. Hito 1 en Evidencia con la aprobación del inspector, dentro de un período de 72 h. |
| 3 · Refacción Escuela Primaria N° 512 | Hito 1: objetado, el árbitro acepta, se vuelve a declarar y se paga. Hito 2: objetado, el árbitro rechaza y queda Aprobado, con `pagable: true`. |
| 4 · Iluminación LED Plaza 25 de Mayo | Los dos hitos pagados: Finalizada. |
| 5 · Demo: obra fondeada | Fondeada por el total (20 000), 4 hitos Pendiente: para ensayar `declarar_hito`. |

En el texto los hitos se numeran desde 1; en la API, `indice` empieza en 0.
