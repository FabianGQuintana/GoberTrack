# Frontend — GoberTrack

Tablero público y panel de firmantes (PRD §10). Next.js 16 (App Router) + React 19 + TypeScript.
Transacciones con `@stellar/stellar-sdk` 17 y firma con Freighter 6.

## Cómo correrlo

```bash
npm install
npm run dev            # http://localhost:3000, modo mock (datos simulados)
npm run build          # build de producción (corre gen:api antes)
npm start              # sirve el build en el puerto 3000
npm test               # Vitest + Testing Library: reglas, transacciones, mocks y pantallas
npm run demo:testnet   # demo del PRD §4 de punta a punta contra testnet (ver abajo)
```

### Modos

| Modo | Variables | Qué hace |
|---|---|---|
| **mock** (por defecto) | ninguna | Datos simulados del frontend (6 obras, DATO SIMULADO). El panel muestra lo que se enviaría; no firma. |
| **API** | `NEXT_PUBLIC_API_URL` | Lee del backend (`http://localhost:3001`). El tablero se actualiza solo cada 5 s. |
| **API + red** | además `NEXT_PUBLIC_CONTRATO_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_NETWORK_PASSPHRASE`, `NEXT_PUBLIC_TOKEN_SAC` (y opcional `NEXT_PUBLIC_EXPLORADOR_URL`) | El panel simula contra el contrato y, con Freighter en testnet, firma y envía. El tablero destaca las obras con un token distinto del SAC oficial. |

Los valores de testnet están en `.env.testnet.example`: copialo a `.env.local` para Next. Las
variables se leen al compilar, así que después de cambiarlas hay que reiniciar `npm run dev` o volver
a correr `npm run build`. Nada de la red está fijo en el código: si el contrato se redespliega, se
cambia `NEXT_PUBLIC_CONTRATO_ID` (ver `contracts/DEPLOY.md`).

El backend tiene que permitir CORS para `http://localhost:3000` (lo hace por defecto): la subida de
evidencia y el refresco en vivo salen del navegador.

Al terminar, verificá que no quede un proceso `node` escuchando en el 3000: en Windows, cortar la
terminal no siempre lo mata.

### Demo de punta a punta sin Freighter

`npm run demo:testnet` corre el guion del PRD §4 contra testnet con **el mismo módulo de
transacciones que el panel** (`src/lib/stellar/transacciones.ts`), firmando con Keypair:

1. `crear_obra` "Pavimentación calle Los Aromos – demo" (4 hitos, período de 60 s, árbitro =
   municipio, token = SAC);
2. `fondear` el total;
3. sube una evidencia al backend y declara el hito 1 con ese hash;
4. aprobaciones de inspector y veedor, espera el período y `liberar_pago` (verifica el saldo del
   contratista);
5. trampa: declarar y liberar el hito 3 → `HitoAnteriorPendiente` en la simulación, sin firma;
6. declara el hito 2, el veedor lo objeta y `liberar_pago` → `ObjecionAbierta`.

Lee `.env.testnet` (copiá `.env.testnet.example`): las variables de red, `API_URL` (un backend en
modo testnet) y, si la CLI no está en el PATH, `STELLAR_CLI`. Las claves de `municipio`,
`contratista`, `inspector` y `veedor` se leen en tiempo de ejecución con `stellar keys show
<nombre>` y nunca se escriben en archivos ni en la salida. Cada corrida crea una obra nueva y usa
40 000 USDCDEMO del municipio (`contracts/scripts/setup-testnet.sh` repone el saldo;
`npx tsx --env-file=.env.testnet scripts/saldo.ts <G…>` lo muestra).

## Pantallas

| Ruta | Qué muestra |
|---|---|
| `/` | Listado de obras con presupuesto, fondeado, pagado, saldo bloqueado y token (destacado si no es el oficial). |
| `/obras/[id]` | Detalle público, sin wallet: montos, hitos en orden (`indice + 1`) con estado, monto, aprobaciones, cuenta regresiva del período, evidencia y motivo por hash con enlace a `GET /evidencia/{sha256}`, declaraciones anteriores, línea de tiempo en castellano y participantes. En vivo con `?desde=`. |
| `/panel/[id]` | Panel de firmantes: conectar Freighter, rol detectado, acciones habilitadas o con el error que devolvería el contrato. Cada acción muestra lo que se envía; en modo API + red se puede simular en la red, y con Freighter en testnet, firmar y enviar. |
| `/evidencia/[sha256]` | Solo modo mock: sirve los archivos simulados (PNG y PDF) para que los enlaces funcionen. |

En desarrollo (`NODE_ENV !== "production"`) el panel muestra un selector **"Simular rol"** para
probar sin wallet: con un rol simulado se puede simular contra la red, pero no firmar. No aparece en
el build de producción.

## Organización

```
src/lib/api/esquema.ts          generado desde ../interfaces/openapi.yaml (npm run gen:api; no editar)
src/lib/api/cliente.ts          cliente único: modo mock o api
src/lib/api/mock/               escenario simulado (DATO SIMULADO), cuentas y simulador del contrato
src/lib/reglas.ts               acciones por rol y estado, en el orden de validación de contract.md §3
src/lib/errores.ts              los 15 errores del contrato con su mensaje
src/lib/invocaciones.ts         función + argumentos (tipo Soroban) + quién firma
src/lib/stellar/config.ts       configuración de red (solo variables NEXT_PUBLIC_*)
src/lib/stellar/argumentos.ts   argumentos → xdr.ScVal
src/lib/stellar/transacciones.ts  simular → firmar → enviar → confirmar; errores del contrato
src/lib/stellar/firmantes.ts    firmante Keypair (scripts); el de Freighter está en lib/wallet.ts
src/lib/stellar/useRelojLedger.ts  hora del último ledger para las reglas del panel
src/lib/archivos.ts             detección de tipo por firma y generadores de PNG/PDF de ejemplo
src/lib/token.ts                ¿la obra usa el token oficial?
src/components/                 tablero y panel (src/components/panel/)
scripts/                        demo de punta a punta y utilidades de lectura
```

## Decisiones

- **Reglas = contrato.** `reglas.ts` recorre los pasos de cada función en el mismo orden que
  `interfaces/contract.md` §3 y devuelve el primer error que aplicaría. Con la red configurada, el
  panel las evalúa con la **hora del último ledger** (`getLatestLedger` del RPC), que es la que usa
  el contrato al simular, y deja un ledger (5 s) de margen para objetar porque la transacción entra
  en un ledger posterior. Sin RPC, usa el reloj del navegador con ±10 s.
- **El contrato decide.** Antes de pedir la firma, cada acción se simula: si el contrato devuelve
  `Error(Contract, #N)`, se muestra traducido y Freighter no se abre. Si la invocación pide la firma
  de otra cuenta (`require_auth` de otro rol), también se corta antes. "Probar igual con el
  contrato" simula una acción que el panel muestra como no permitida: así se ve la trampa de la demo
  rechazada por el contrato, no solo por la interfaz.
- **Firma solo en testnet.** Se bloquea si Freighter está en otra red (se compara la passphrase con
  la configurada), con un rol simulado, en modo mock o sin configuración de red.
- **Token oficial.** El contrato acepta cualquier token (contract.md v1.1 §0). El tablero compara el
  token de cada obra con `NEXT_PUBLIC_TOKEN_SAC` y destaca las que no coinciden; sus montos no se
  rotulan como USDC.
- **En vivo.** El detalle pide `GET /obras/{id}/eventos?desde=<último id>` cada 5 s y, si llegó algo,
  refresca la página del servidor sin perder el estado del navegador.
- **Mock coherente por construcción.** El escenario reproduce el seed del backend (obras 1–4, mismas
  cuentas, montos y línea de tiempo) aplicando cada paso con un simulador que valida con `reglas.ts`.
  Suma dos obras propias: la 5, fondeada y con todo Pendiente (para ensayar declarar), y la 6, con un
  token no oficial. Las evidencias son PNG y PDF reales, y el mock valida el tipo por los primeros
  bytes, como el backend.
- **Montos** siempre como string → BigInt, en notación argentina (`1.500,0000000`).
- **Horarios** en hora de Argentina con zona fija, para que el HTML del servidor y del navegador
  coincidan.

## Supuestos y datos simulados

- Todos los datos del modo mock y de la demo — **DATO SIMULADO**.
- Token "USDC" de prueba con 7 decimales — **SUPUESTO** (es USDCDEMO; "USDC" es solo la etiqueta).
- Límites de evidencia (JPEG/PNG/PDF, 10 MB) — **SUPUESTO** del OpenAPI, aplicados igual en mock.
- Formato de `Evento.datos` según openapi.yaml v1.0.1. Igual se tolera un `fin_periodo` numérico.
- La firma con Freighter real no se pudo probar acá: el navegador de pruebas no tiene la extensión.
  Se probó el mismo flujo con un firmante Keypair (script) y con Freighter simulado (pruebas).
