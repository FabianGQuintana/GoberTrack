#!/usr/bin/env bash
# Prepara Stellar testnet para Obra Pública Verificable (Fase 0):
#   1. identidades municipio (también árbitro en el MVP), contratista, inspector, veedor y emisor,
#      fondeadas con friendbot;
#   2. activo de prueba ASSET_CODE emitido por `emisor` (DATO SIMULADO);
#   3. trustline con el activo para municipio y contratista;
#   4. Stellar Asset Contract (SAC) del activo;
#   5. saldo del municipio hasta MINT_AMOUNT unidades (DATO SIMULADO);
#   6. resumen.
# Es idempotente: se puede correr varias veces seguidas. Las claves quedan en el almacén de la
# CLI (~/.config/stellar); este script solo imprime direcciones públicas.
#
# Uso: contracts/scripts/setup-testnet.sh
#   ASSET_CODE   código del activo (por defecto USDCDEMO)
#   MINT_AMOUNT  saldo objetivo del municipio, en unidades enteras (por defecto 100000)
set -euo pipefail
shopt -s inherit_errexit 2>/dev/null || true # bash >= 4.4; en 3.2 (macOS) se sigue sin él

NETWORK="testnet"
ASSET_CODE="${ASSET_CODE:-USDCDEMO}"
MINT_AMOUNT="${MINT_AMOUNT:-100000}"
STROOPS_POR_UNIDAD=10000000 # 7 decimales
IDENTIDADES=(municipio contratista inspector veedor emisor)
CON_TRUSTLINE=(municipio contratista)

log() { printf '==> %s\n' "$*" >&2; }
error() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if ! command -v stellar >/dev/null 2>&1 && [ -d "$HOME/.cargo/bin" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi
command -v stellar >/dev/null 2>&1 || error "no se encontró la Stellar CLI (stellar) en el PATH"

[[ "$ASSET_CODE" =~ ^[A-Za-z0-9]{1,12}$ ]] || error "ASSET_CODE debe tener de 1 a 12 caracteres alfanuméricos"
# El tope evita desbordar el int64 de los saldos clásicos al pasar a stroops.
[[ "$MINT_AMOUNT" =~ ^[1-9][0-9]{0,11}$ ]] && (( MINT_AMOUNT <= 922337203685 )) \
  || error "MINT_AMOUNT debe ser un entero entre 1 y 922337203685"

# Salida estándar de la CLI sin \r (Git Bash en Windows).
cli() { stellar "$@" | tr -d '\r'; }

direccion() { cli keys address "$1"; }

# Verdadero si `stellar ledger entry fetch ...` no devolvió ninguna entrada. Como se usa dentro
# de `if`, donde bash no aplica `set -e`, los fallos de la consulta cortan el script a mano.
sin_entradas() {
  local salida
  salida="$(cli ledger entry fetch "$@" --network "$NETWORK")" || error "falló: ledger entry fetch $*"
  [[ "$salida" == *'"entries":'* ]] || error "respuesta inesperada de ledger entry fetch $*: $salida"
  [[ "$salida" == *'"entries":[]'* ]]
}

# Saldo de una cuenta en el SAC, en stroops (simulación, no envía transacción).
saldo() {
  local valor
  valor="$(cli contract invoke --id "$SAC_ID" --source-account "$1" --network "$NETWORK" --send=no \
    -- balance --id "$(direccion "$1")" | tr -d '"')"
  [[ "$valor" =~ ^[0-9]+$ ]] || error "saldo inesperado de $1: '$valor'"
  printf '%s' "$valor"
}

en_unidades() { printf '%d.%07d' $(( $1 / STROOPS_POR_UNIDAD )) $(( $1 % STROOPS_POR_UNIDAD )); }

# 1. Identidades
for nombre in "${IDENTIDADES[@]}"; do
  if stellar keys address "$nombre" >/dev/null 2>&1; then
    # Ya existe: se refondea solo si la cuenta no está en la red (por ejemplo, tras un reinicio de testnet).
    if sin_entradas account --account "$nombre"; then
      log "fondeando $nombre con friendbot"
      stellar keys fund "$nombre" --network "$NETWORK"
    else
      log "identidad $nombre: ya existe y está fondeada"
    fi
  else
    log "creando y fondeando identidad $nombre"
    stellar keys generate "$nombre" --network "$NETWORK" --fund
  fi
done

# 2. Activo de prueba
EMISOR="$(direccion emisor)"
ASSET="$ASSET_CODE:$EMISOR"
log "activo: $ASSET"

# 3. Trustlines
for nombre in "${CON_TRUSTLINE[@]}"; do
  if sin_entradas trustline --account "$nombre" --asset "$ASSET"; then
    log "creando trustline de $nombre con $ASSET_CODE"
    stellar tx new change-trust --source-account "$nombre" --line "$ASSET" --network "$NETWORK"
  else
    log "trustline de $nombre con $ASSET_CODE: ya existe"
  fi
done

# 4. Stellar Asset Contract
SAC_ID="$(cli contract id asset --asset "$ASSET" --network "$NETWORK")"
if sin_entradas contract-data --contract "$SAC_ID" --instance; then
  log "desplegando el SAC de $ASSET_CODE"
  stellar contract asset deploy --asset "$ASSET" --source-account emisor --network "$NETWORK" >/dev/null
else
  log "SAC de $ASSET_CODE: ya desplegado"
fi
SAC_ALIAS="$(printf '%s' "$ASSET_CODE" | tr '[:upper:]' '[:lower:]')"
stellar contract alias add "$SAC_ALIAS" --id "$SAC_ID" --overwrite --network "$NETWORK"

# 5. Saldo del municipio: se emite solo lo que falta para llegar a MINT_AMOUNT.
OBJETIVO=$(( MINT_AMOUNT * STROOPS_POR_UNIDAD ))
SALDO="$(saldo municipio)"
if (( SALDO < OBJETIVO )); then
  FALTANTE=$(( OBJETIVO - SALDO ))
  log "emitiendo $(en_unidades "$FALTANTE") $ASSET_CODE al municipio"
  # payment acepta CODIGO:EMISOR; el pago desde la cuenta emisora crea las unidades.
  stellar tx new payment --source-account emisor --destination "$(direccion municipio)" \
    --asset "$ASSET" --amount "$FALTANTE" --network "$NETWORK"
  SALDO="$(saldo municipio)"
else
  log "el municipio ya tiene $(en_unidades "$SALDO") $ASSET_CODE (>= $MINT_AMOUNT): no se emite"
fi

# 6. Resumen
echo
echo "=== Resumen ($NETWORK) ==="
for nombre in "${IDENTIDADES[@]}"; do
  printf '%-12s %s\n' "$nombre" "$(direccion "$nombre")"
done
echo "(el municipio es también el árbitro en el MVP)"
printf '%-12s %s\n' "activo" "$ASSET_CODE"
printf '%-12s %s\n' "emisor" "$EMISOR"
printf '%-12s %s (alias %s)\n' "SAC" "$SAC_ID" "$SAC_ALIAS"
printf '%-12s %s %s (%s stroops)\n' "saldo mun." "$(en_unidades "$SALDO")" "$ASSET_CODE" "$SALDO"
