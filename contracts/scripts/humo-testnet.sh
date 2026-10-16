#!/usr/bin/env bash
# Corrida de humo del contrato desplegado en testnet: crea la obra de la demo, la fondea y paga el
# hito 0 (declarar → aprueban inspector y veedor → se cumple el período → liberar_pago).
# Requiere haber corrido setup-testnet.sh y desplegado el contrato (ver DEPLOY.md).
# Cada corrida crea una obra nueva y usa 40 000 USDCDEMO del municipio; setup-testnet.sh repone
# el saldo.
#
# Uso: contracts/scripts/humo-testnet.sh [CONTRATO]   (id C... o alias; por defecto obra_publica)
#   ASSET_CODE  código del activo (por defecto USDCDEMO)
set -euo pipefail
shopt -s inherit_errexit 2>/dev/null || true # bash >= 4.4; en 3.2 (macOS) se sigue sin él

NETWORK="testnet"
CONTRATO="${1:-obra_publica}"
ASSET_CODE="${ASSET_CODE:-USDCDEMO}"
PERIODO=60                  # segundos (DATO SIMULADO)
STROOPS_POR_UNIDAD=10000000 # 7 decimales

log() { printf '==> %s\n' "$*" >&2; }
error() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if ! command -v stellar >/dev/null 2>&1 && [ -d "$HOME/.cargo/bin" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi
command -v stellar >/dev/null 2>&1 || error "no se encontró la Stellar CLI (stellar) en el PATH"

# Salida estándar de la CLI sin \r (Git Bash en Windows).
cli() { stellar "$@" | tr -d '\r'; }
direccion() { cli keys address "$1"; }
unidades() { echo $(( $1 * STROOPS_POR_UNIDAD )); }

# invocar <identidad que firma> <función> [args...]
invocar() {
  local fuente="$1"
  shift
  cli contract invoke --id "$CONTRATO_ID" --source-account "$fuente" --network "$NETWORK" -- "$@"
}

if [[ "$CONTRATO" =~ ^C[A-Z2-7]{55}$ ]]; then
  CONTRATO_ID="$CONTRATO"
else
  CONTRATO_ID="$(cli contract alias show "$CONTRATO" --network "$NETWORK")"
fi
MUNICIPIO="$(direccion municipio)"
CONTRATISTA="$(direccion contratista)"
INSPECTOR="$(direccion inspector)"
VEEDOR="$(direccion veedor)"
SAC="$(cli contract id asset --asset "$ASSET_CODE:$(direccion emisor)" --network "$NETWORK")"
LEDGER_INICIO="$(cli ledger latest --network "$NETWORK" | sed -n 's/^Sequence: //p')"

# Saldo de una identidad en el SAC, en stroops (simulación, no envía transacción).
saldo() {
  cli contract invoke --id "$SAC" --source-account "$1" --network "$NETWORK" --send=no \
    -- balance --id "$(direccion "$1")" | tr -d '"'
}

log "contrato $CONTRATO_ID, token $ASSET_CODE ($SAC), ledger inicial $LEDGER_INICIO"

# Obra de la demo (DATO SIMULADO): 4 hitos de 10 000 / 15 000 / 10 000 / 5 000 unidades.
# Los i128 van como texto en el JSON; el árbitro es el municipio (MVP).
HITOS="[
  {\"descripcion\":\"Movimiento de suelo\",\"monto\":\"$(unidades 10000)\"},
  {\"descripcion\":\"Base y sub-base\",\"monto\":\"$(unidades 15000)\"},
  {\"descripcion\":\"Carpeta asfáltica\",\"monto\":\"$(unidades 10000)\"},
  {\"descripcion\":\"Señalización y cordones\",\"monto\":\"$(unidades 5000)\"}
]"
TOTAL="$(unidades 40000)"
HITO_0="$(unidades 10000)"

log "crear_obra"
OBRA="$(invocar municipio crear_obra --municipio "$MUNICIPIO" \
  --nombre "Pavimentación calle Los Aromos" --contratista "$CONTRATISTA" \
  --inspector "$INSPECTOR" --veedor "$VEEDOR" --arbitro "$MUNICIPIO" --token "$SAC" \
  --hitos "$HITOS" --periodo_objecion "$PERIODO")"
[[ "$OBRA" =~ ^[0-9]+$ ]] || error "crear_obra devolvió '$OBRA'"
log "obra $OBRA creada"

log "fondear $TOTAL stroops"
invocar municipio fondear --obra "$OBRA" --monto "$TOTAL"

EVIDENCIA="$(printf 'Foto de ejemplo del hito 0 (DATO SIMULADO)' | sha256sum | cut -d' ' -f1)"
log "declarar_hito 0 con evidencia $EVIDENCIA"
invocar contratista declarar_hito --obra "$OBRA" --hito 0 --evidencia_hash "$EVIDENCIA"

log "aprobar hito 0 (inspector y veedor)"
invocar inspector aprobar --obra "$OBRA" --hito 0 --firmante "$INSPECTOR"
invocar veedor aprobar --obra "$OBRA" --hito 0 --firmante "$VEEDOR"

SALDO_ANTES="$(saldo contratista)"

# liberar_pago falla con PeriodoNoCumplido hasta que pasa el período: se simula hasta que pase.
log "esperando el fin del período ($PERIODO s)"
sleep "$PERIODO"
intentos=0
until cli contract invoke --id "$CONTRATO_ID" --source-account contratista --network "$NETWORK" \
  --send=no -- liberar_pago --obra "$OBRA" --hito 0 >/dev/null 2>&1; do
  intentos=$(( intentos + 1 ))
  (( intentos <= 12 )) || error "liberar_pago sigue fallando después del período"
  sleep 5
done

log "liberar_pago hito 0"
invocar contratista liberar_pago --obra "$OBRA" --hito 0

SALDO_DESPUES="$(saldo contratista)"
COBRADO=$(( SALDO_DESPUES - SALDO_ANTES ))
(( COBRADO == HITO_0 )) || error "el contratista cobró $COBRADO stroops, se esperaban $HITO_0"

echo
echo "=== Obra $OBRA ==="
invocar contratista ver_obra --obra "$OBRA"
echo "=== Hito 0 ==="
invocar contratista ver_hito --obra "$OBRA" --hito 0
echo "=== Eventos del contrato desde el ledger $LEDGER_INICIO ==="
cli events --network "$NETWORK" --id "$CONTRATO_ID" --start-ledger "$LEDGER_INICIO" \
  --output json --count 50
echo
echo "contratista: $SALDO_ANTES → $SALDO_DESPUES stroops (cobró $COBRADO = 10000 $ASSET_CODE)"
