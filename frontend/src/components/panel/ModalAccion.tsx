"use client";

import { useEffect, useState } from "react";
import type { Invocacion } from "@/lib/invocaciones";
import { formatearMonto } from "@/lib/montos";
import { mensajeError } from "@/lib/errores";
import { NOMBRE_ROL } from "@/lib/roles";
import { argumentosDe } from "@/lib/stellar/argumentos";
import { describirRechazo, enviar, ErrorTransaccion, simular, type Etapa } from "@/lib/stellar/transacciones";
import { formatearFechaHora } from "@/lib/tiempo";
import { Huella } from "../ui/Huella";
import { Icono } from "../ui/Icono";
import { Modal } from "../ui/Modal";
import { HASH_DE_PRUEBA, type ContextoEnvio } from "./envio";

/** Lo que el panel le pide al modal: qué se invoca y cómo explicárselo a la persona. */
export interface PedidoAccion {
  invocacion: Invocacion;
  /** "¿Aprobar el hito 2?" */
  pregunta: string;
  /** "No se puede aprobar el hito 2" (si el contrato la rechaza). */
  noSePuede: string;
  /** Contexto chico debajo del título (nombre de la obra). */
  contexto: string;
  /** Qué va a pasar, en viñetas. */
  consecuencias: React.ReactNode[];
  /** Texto del botón principal: "Aprobar y firmar". */
  confirmar: string;
  /** Mensaje cuando la red confirma: "Tu aprobación ya figura en la red." */
  hecho: string;
  /** "Probar igual con el contrato": solo simula, apenas se abre. */
  soloSimular?: boolean;
}

const PASOS: { etapa: Etapa | "confirmado"; pendiente: string; hecho: string }[] = [
  { etapa: "simulando", pendiente: "Comprobando con el contrato", hecho: "Comprobado con el contrato" },
  { etapa: "firmando", pendiente: "Firmá en Freighter", hecho: "Firmado en Freighter" },
  { etapa: "enviando", pendiente: "Enviando", hecho: "Enviado" },
  { etapa: "confirmando", pendiente: "Esperando confirmación de la red", hecho: "Confirmado por la red" },
  { etapa: "confirmado", pendiente: "Confirmado", hecho: "Confirmado" },
];

const TITULO_ETAPA: Record<Etapa, { titulo: string; texto: string }> = {
  simulando: {
    titulo: "Comprobando con el contrato…",
    texto: "Antes de pedirte la firma, le preguntamos al contrato si esta acción está permitida.",
  },
  firmando: { titulo: "Firmá en Freighter", texto: "Se abrió la ventana de Freighter. Revisá los datos y firmá. No cierres esta pantalla." },
  enviando: { titulo: "Enviando tu firma…", texto: "Estamos mandando la transacción a la red." },
  confirmando: {
    titulo: "Esperando confirmación de la red…",
    texto: "Todavía no está confirmado. Puede tardar unos segundos; no hace falta repetir la acción.",
  },
};

type Estado =
  | { tipo: "inicial" }
  | { tipo: "en-curso"; etapa: Etapa }
  | { tipo: "simulada" }
  | { tipo: "confirmada"; hash: string; ledger: number; retorno: unknown; momento: number }
  | { tipo: "error"; error: unknown };

function Pasos({ actual, error = false }: { actual: Etapa | "confirmado"; error?: boolean }) {
  const indiceActual = PASOS.findIndex((p) => p.etapa === actual);
  return (
    <ol className="lista-limpia pila" aria-label="Pasos">
      {PASOS.map((p, i) => {
        const hecho = i < indiceActual || actual === "confirmado";
        const esActual = i === indiceActual && actual !== "confirmado";
        return (
          <li key={p.etapa} className={`paso${hecho ? "" : esActual ? " paso--actual" : " paso--pendiente"}`}>
            <span
              className={`paso__punto paso__punto--${hecho ? "hecho" : esActual ? (error ? "error" : "actual") : "pendiente"}`}
              aria-hidden="true"
            >
              {hecho ? (
                <Icono nombre="check" tamano={14} />
              ) : esActual && error ? (
                <Icono nombre="cerrar" tamano={14} />
              ) : esActual && p.etapa === "firmando" ? (
                <Icono nombre="firma" tamano={14} />
              ) : esActual ? (
                <span className="giro" />
              ) : null}
            </span>
            {hecho ? p.hecho : p.pendiente}
            {" "}<span className="visualmente-oculto">{hecho ? "(hecho)" : esActual ? "(en curso)" : "(pendiente)"}</span>
          </li>
        );
      })}
    </ol>
  );
}

function textoArgumentos(invocacion: Invocacion): string {
  return invocacion.argumentos
    .map(({ nombre, tipo, valor }) => {
      let nota = "";
      if (nombre === "hito") nota = `   ← Hito ${Number(valor) + 1} en pantalla`;
      if (nombre === "monto") nota = `   ← ${formatearMonto(BigInt(valor), true)}`;
      if (valor === HASH_DE_PRUEBA) nota = "   ← huella de prueba (solo para simular)";
      return `  ${nombre}: ${tipo} = ${valor}${nota}`;
    })
    .join("\n");
}

/** El motivo de un rechazo en castellano, con el código del contrato al lado para quien lo verifique. */
function Rechazo({ error, invocacion }: { error: unknown; invocacion: Invocacion }) {
  if (error instanceof ErrorTransaccion) {
    const { motivo, etapa } = error;
    if (motivo.tipo === "contrato") {
      return (
        <div className="aviso aviso--peligro" role="alert">
          <Icono nombre="candado" />
          <div className="pila pila--chica">
            <b>
              {mensajeError(motivo.codigo)}{" "}
              <span className="mono" style={{ fontWeight: 400 }}>
                ({motivo.codigo}, error del contrato #{motivo.numero})
              </span>
            </b>
            <span className="chico">
              {etapa === "simulando"
                ? "El contrato no lo permite, así que no te pedimos la firma y no se movió ningún fondo."
                : "La red rechazó la transacción ya firmada. No se movió ningún fondo."}
            </span>
          </div>
        </div>
      );
    }
    if (motivo.tipo === "autorizacion" && invocacion.firma) {
      return (
        <div className="aviso aviso--peligro" role="alert">
          <Icono nombre="candado" />
          <div className="pila pila--chica">
            <b>Esta acción la tiene que firmar el {NOMBRE_ROL[invocacion.firma.rol].toLowerCase()} de la obra.</b>
            <span className="chico">
              Cuenta del {NOMBRE_ROL[invocacion.firma.rol].toLowerCase()}: <code>{invocacion.firma.direccion}</code>. Con otra
              cuenta la red la rechaza (error de autorización).
              {etapa === "simulando" ? " No te pedimos ninguna firma." : ""}
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="aviso aviso--peligro" role="alert">
        <Icono nombre="alerta" />
        <div className="pila pila--chica">
          <b>{motivo.tipo === "firma" ? "No se pudo completar: no se firmó" : "No se pudo completar"}</b>
          <span className="chico">
            {describirRechazo(motivo)}
            {etapa === "simulando" ? " No te pedimos ninguna firma." : ""}
            {motivo.tipo === "firma" ? " No se registró nada." : ""}
            {motivo.tipo === "sin-confirmar"
              ? " Puede que igual se confirme: revisá la línea de tiempo en unos segundos antes de repetir."
              : ""}
          </span>
          {error.hash && (
            <span className="chico">
              Transacción <Huella valor={error.hash} etiqueta="identificador de la transacción" />
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <p className="aviso aviso--peligro" role="alert">
      <Icono nombre="alerta" />
      {error instanceof Error ? error.message : "No se pudo completar la operación."}
    </p>
  );
}

/**
 * Flujo de una acción firmada: confirmación → comprobando con el contrato → firmá en Freighter →
 * enviando → esperando confirmación → confirmado. Nunca dice "Confirmado" antes de que la red lo
 * confirme. Si el contrato rechaza en la simulación, Freighter ni se abre.
 * Sin `envio` (modo mock o sin red configurada) es solo una vista previa.
 */
export function ModalAccion({
  pedido,
  envio,
  alCerrar,
  alConfirmar,
}: {
  pedido: PedidoAccion;
  envio: ContextoEnvio | null;
  alCerrar: () => void;
  alConfirmar?: (retorno: unknown) => void;
}) {
  const { invocacion, soloSimular = false } = pedido;
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });

  const datos = envio
    ? { contratoId: envio.contratoId, funcion: invocacion.funcion, args: argumentosDe(invocacion), origen: envio.origen }
    : null;

  async function simularEnLaRed() {
    if (!envio || !datos) return;
    setEstado({ tipo: "en-curso", etapa: "simulando" });
    try {
      await simular(envio.red, datos);
      setEstado({ tipo: "simulada" });
    } catch (error) {
      setEstado({ tipo: "error", error });
    }
  }

  async function firmarYEnviar() {
    if (!envio?.firmar || !datos) return;
    try {
      const r = await enviar(envio.red, {
        ...datos,
        firmar: envio.firmar,
        alAvanzar: (etapa) => setEstado({ tipo: "en-curso", etapa }),
      });
      setEstado({ tipo: "confirmada", hash: r.hash, ledger: r.ledger, retorno: r.retorno, momento: Date.now() });
      alConfirmar?.(r.retorno);
    } catch (error) {
      setEstado({ tipo: "error", error });
    }
  }

  useEffect(() => {
    // Solo al abrir: "probar igual" simula enseguida.
    if (soloSimular) void simularEnLaRed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enCurso = estado.tipo === "en-curso";
  const errorAntesDeFirmar =
    estado.tipo === "error" && estado.error instanceof ErrorTransaccion && estado.error.etapa === "simulando";
  const etapaError = estado.tipo === "error" && estado.error instanceof ErrorTransaccion ? estado.error.etapa : null;
  const urlTx = estado.tipo === "confirmada" ? envio?.urlTransaccion(estado.hash) : null;

  const titulo =
    estado.tipo === "en-curso"
      ? TITULO_ETAPA[estado.etapa].titulo
      : estado.tipo === "confirmada"
        ? "Confirmado"
        : estado.tipo === "error"
          ? soloSimular
            ? "El contrato la rechazó"
            : errorAntesDeFirmar
              ? pedido.noSePuede
              : "No se pudo completar"
          : soloSimular
            ? "Prueba contra el contrato"
            : pedido.pregunta;

  const detalleTecnico = (
    <details className="detalles">
      <summary>Detalle técnico: lo que se envía al contrato</summary>
      <pre>{`${invocacion.funcion}(\n${textoArgumentos(invocacion)}\n)`}</pre>
      <p className="chico suave" style={{ marginTop: 6 }}>
        {invocacion.firma ? (
          <>
            Firma requerida: {NOMBRE_ROL[invocacion.firma.rol].toLowerCase()} (<code>{invocacion.firma.direccion}</code>).
          </>
        ) : (
          <>No pide la firma de un rol: la puede enviar cualquier cuenta (paga la comisión) y el pago va siempre al contratista de la obra.</>
        )}
      </p>
    </details>
  );

  return (
    <Modal titulo={titulo} alCerrar={alCerrar} bloqueado={enCurso} alerta={estado.tipo === "error"}>
      <div aria-live="polite" className="pila">
        {estado.tipo === "inicial" && !soloSimular && (
          <>
            <p className="chico suave">{pedido.contexto}</p>
            <ul className="medio pila pila--chica" style={{ paddingLeft: 20 }}>
              {pedido.consecuencias.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            {detalleTecnico}
            {!envio && (
              <p className="aviso aviso--neutro chico">
                <Icono nombre="info" />
                <span>
                  <b>Vista previa:</b> no se firmó ni se envió nada (modo de demostración o sin la red configurada).
                </span>
              </p>
            )}
            {envio && !envio.firmar && envio.motivoSinFirma && (
              <p className="motivo">
                <Icono nombre="candado" tamano={16} />
                <span>No se puede firmar: {envio.motivoSinFirma} Podés comprobarla con el contrato igual.</span>
              </p>
            )}
            <div className="modal__acciones">
              <button type="button" className="boton" onClick={alCerrar}>
                Cancelar
              </button>
              {envio && (
                <button type="button" className={`boton${envio.firmar ? " boton--texto" : ""}`} onClick={simularEnLaRed}>
                  Comprobar con el contrato
                </button>
              )}
              {envio && (
                <button type="button" className="boton boton--primario" onClick={firmarYEnviar} disabled={!envio.firmar}>
                  {pedido.confirmar}
                </button>
              )}
            </div>
          </>
        )}

        {estado.tipo === "inicial" && soloSimular && <Pasos actual="simulando" />}

        {estado.tipo === "en-curso" && (
          <>
            <p className="chico suave">{soloSimular ? "Le preguntamos al contrato, sin firmar ni enviar nada." : TITULO_ETAPA[estado.etapa].texto}</p>
            <Pasos actual={estado.etapa} />
          </>
        )}

        {estado.tipo === "simulada" && (
          <>
            <p className="aviso aviso--exito" role="status">
              <Icono nombre="check-circulo" />
              <span>
                <b>El contrato aceptaría esta acción ahora.</b> Se comprobó simulándola en la red: no se firmó ni se envió
                nada.
              </span>
            </p>
            {detalleTecnico}
            <div className="modal__acciones">
              <button type="button" className="boton" onClick={alCerrar}>
                Cerrar
              </button>
              {!soloSimular && envio?.firmar && (
                <button type="button" className="boton boton--primario" onClick={firmarYEnviar}>
                  {pedido.confirmar}
                </button>
              )}
            </div>
          </>
        )}

        {estado.tipo === "confirmada" && (
          <>
            <div className="fila" style={{ gap: 12 }}>
              <span className="circulo fondo-ap" aria-hidden="true">
                <Icono nombre="check-circulo" tamano={26} />
              </span>
              <p role="status">
                <b>{pedido.hecho}</b>
                <span className="chico suave" style={{ display: "block" }}>
                  Confirmado en el ledger {estado.ledger} · {formatearFechaHora(estado.momento)}. La página se actualiza en
                  unos segundos.
                </span>
              </p>
            </div>
            <span className="chico">
              Transacción <Huella valor={estado.hash} etiqueta="identificador de la transacción" />
              {" "}<span className="visualmente-oculto">{estado.hash}</span>
            </span>
            {urlTx && (
              <a className="enlace" href={urlTx} target="_blank" rel="noreferrer">
                Ver transacción
                <Icono nombre="externo" tamano={14} />
              </a>
            )}
            <button type="button" className="boton boton--primario" style={{ alignSelf: "flex-start" }} onClick={alCerrar}>
              Listo
            </button>
          </>
        )}

        {estado.tipo === "error" && (
          <>
            {!soloSimular && etapaError && etapaError !== "simulando" && <Pasos actual={etapaError} error />}
            <Rechazo error={estado.error} invocacion={invocacion} />
            {soloSimular && (
              <p className="chico suave">
                Se la consultamos al contrato simulando la transacción en la red: la rechazó la regla del contrato, no solo
                esta pantalla. No se firmó ni se envió nada.
              </p>
            )}
            <div className="modal__acciones">
              <button type="button" className="boton boton--primario" onClick={alCerrar}>
                {soloSimular || errorAntesDeFirmar ? "Entendido" : "Cerrar"}
              </button>
              {!soloSimular && !errorAntesDeFirmar && envio?.firmar && (
                <button type="button" className="boton" onClick={firmarYEnviar}>
                  Reintentar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
