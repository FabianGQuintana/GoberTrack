# Guion de la demo (≈ 3 min)

Ideathon NEA Tech 2026 · Obra Pública Verificable. Basado en el PRD §4. Todo corre en **Stellar testnet** con un token de prueba (USDCDEMO, DATO SIMULADO).

## Antes de subir al escenario (10 min antes)

1. Backend en modo testnet: `cd backend && npm run dev:testnet`. Esperá a que `GET http://localhost:3001/obras` liste las obras (≈ 20 s).
2. Frontend: `cd frontend && npm run dev`, con `.env.local` copiado de `.env.testnet.example`.
3. Abrí dos pestañas:
   - **A:** tablero `http://localhost:3000/obras/<N>`.
   - **B:** panel `http://localhost:3000/panel/<N>`.
4. Freighter en **Testnet**, con las 4 cuentas importadas (municipio = árbitro, contratista, inspector, veedor). Arrancá con la del contratista.
5. Tené a mano un archivo de evidencia (`foto-hito1.jpg`, DATO SIMULADO) y otro para el motivo de la objeción (`motivo.pdf`).
6. **Obra limpia:** usá la obra 4, o creá una nueva si ya se usó (ver al final). Revisá que esté fondeada y con los 4 hitos `Pendiente`.

## Guion

| Tiempo | Pantalla | Qué se hace | Qué se dice |
| --- | --- | --- | --- |
| 0:00–0:25 | Tablero (A) | Mostrar la obra: presupuesto, saldo bloqueado, 4 hitos, línea de tiempo | "Hoy nadie fuera del circuito puede verificar que un pago de obra respondió a un avance real. Acá el dinero está bloqueado en un contrato público en Stellar, y cada paso queda registrado para siempre." |
| 0:25–1:10 | Panel (B), contratista | Subir la foto → se ve el SHA-256 → **Declarar hito 1** → firmar en Freighter | "El contratista sube la evidencia. Lo que va a la cadena es su huella digital: si alguien cambia la foto después, no coincide." |
| | Panel (B), inspector y veedor | Cambiar de cuenta en Freighter → **Aprobar** (inspector) → cambiar → **Aprobar** (veedor) | "Hacen falta dos firmas independientes: el inspector y un veedor. Ninguno puede aprobar dos veces ni en nombre del otro." |
| 1:10–1:40 | Tablero (A) | Cuenta regresiva del período de objeción (1 min), en vivo | "Antes de pagar hay un período de objeción. Nadie puede saltearlo: el reloj es el de la red, no el de una computadora." |
| 1:40–2:00 | Panel (B), cualquiera | **Liberar pago** → firmar | "Cuando se cumplen todas las reglas, cualquiera puede ejecutar el pago. No hay discrecionalidad: el contrato lo decide solo." Mostrar en A: hito 1 **Pagado**, saldo y línea de tiempo actualizados |
| 2:00–2:25 | Panel (B), contratista | Intentar **declarar el hito 3** | "¿Y si el contratista quiere cobrar el hito 3 sin terminar el 2?" El panel muestra **"El hito anterior todavía no está aprobado"** sin pedir firma: **el contrato lo rechaza solo** |
| 2:25–2:50 | Panel (B), contratista → veedor | Declarar el hito 2 → como veedor, **Objetar** subiendo `motivo.pdf` | "El veedor ve un problema y objeta dentro del período." En A: hito 2 **Objetado**; el pago queda **congelado** y el hito 3 sigue bloqueado |
| 2:50–3:00 | Tablero (A) | Línea de tiempo completa con enlaces al explorador | "Todo esto es público y verificable por cualquier ciudadano, sin wallet. Trazabilidad para quien adopta; anticorrupción para la ciudadanía." |

### Si sobra tiempo

Como municipio (que es el árbitro en el MVP), **Resolver la objeción → Rechazar**. El rechazo cuenta como aprobación del veedor y el hito 2 se puede pagar al cumplirse su período.

## Qué decir de las limitaciones (si preguntan)

- El árbitro es el propio municipio. En una versión real debería ser independiente.
- Si el veedor o el inspector no actúan, el pago queda trabado, y no hay devolución de fondos: es un MVP.
- El pago es un token de prueba en testnet. El desembolso real seguiría en pesos fuera de la cadena (SUPUESTO).
- El período de 1 minuto es para la demo. En la vida real serían días.
- **Visión futura:** cola de pagos FIFO entre obras con fondos compartidos, adendas con alerta de sobrecosto, geolocalización de la evidencia.

## Plan B (si falla algo en vivo)

| Falla | Qué hacer |
| --- | --- |
| Freighter no conecta o la red no responde a tiempo | Correr la demo automática: `cd frontend && API_URL=http://localhost:3001 npm run demo:testnet`. Hace todo el guion firmando desde la CLI, mientras el tablero (A) se actualiza en vivo |
| El backend no muestra lo último | Esperar 5–10 s: el RPC público reparte las consultas entre nodos y el backend relee solo cuando un nodo va atrasado. Si no, reiniciar `npm run dev:testnet` |
| No hay internet | Modo simulado: backend `npm run seed && npm run dev` y frontend sin `.env.local`. Mostrar la obra 5 del seed (fondeada, hitos `Pendiente`) |
| Todo falla | Video de respaldo (ver abajo) |

## Crear una obra limpia

```bash
# Con las identidades de la CLI (en la máquina que las tiene). Devuelve el id de la obra.
C=CCRFFXP25OT5FOI3VJXAX666QI76YWHV52IYTG45ICK4TMB7QFS7KYSM
SAC=CAKGWGZQI6XOF6XAP2BB2DM6DQP525ETKYDT5UHSYBF2XRA6JUITA2QK
M=$(stellar keys address municipio)
H='[{"descripcion":"Movimiento de suelo","monto":"100000000000"},{"descripcion":"Base y sub-base","monto":"150000000000"},{"descripcion":"Carpeta asfáltica","monto":"100000000000"},{"descripcion":"Señalización y cordones","monto":"50000000000"}]'
stellar contract invoke --id $C --source-account municipio --network testnet -- crear_obra \
  --municipio $M --nombre "Pavimentación calle Los Aromos" \
  --contratista $(stellar keys address contratista) --inspector $(stellar keys address inspector) \
  --veedor $(stellar keys address veedor) --arbitro $M --token $SAC --hitos "$H" --periodo_objecion 60
stellar contract invoke --id $C --source-account municipio --network testnet -- fondear --obra <ID> --monto 400000000000
```

Si al municipio le falta saldo: `MINT_AMOUNT=300000 bash contracts/scripts/setup-testnet.sh`.

## Video de respaldo (lo graba una persona)

Grabá la pantalla con OBS, o la grabación de pantalla de Windows (Win+Alt+R), siguiendo el guion de arriba con una obra limpia. Si no hay tiempo de hacerlo a mano, alcanza con grabar la pestaña A mientras corre `npm run demo:testnet`. Duración objetivo: 3 min, sin cortes.
