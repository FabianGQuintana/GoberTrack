"use client";

import { useEffect, useRef, useState } from "react";
import type { Invocacion } from "@/lib/invocaciones";
import { formatearMonto } from "@/lib/montos";
import { NOMBRE_ROL } from "@/lib/roles";
import { argumentosDe } from "@/lib/stellar/argumentos";
import { describirRechazo, enviar, ErrorTransaccion, simular, type Etapa } from "@/lib/stellar/transacciones";
import { HASH_DE_PRUEBA, type ContextoEnvio } from "./envio";
import { TextoMotivo } from "./TextoMotivo";

function textoArgumentos(invocacion: Invocacion): string {
  return invocacion.argumentos
    .map(({ nombre, tipo, valor }) => {
      let nota = "";
      if (nombre === "hito") nota = `   ← Hito ${Number(valor) + 1} en pantalla`;
      if (nombre === "monto") nota = `   ← ${formatearMonto(BigInt(valor), true)}`;
      if (valor === HASH_DE_PRUEBA) nota = "   ← hash de prueba (solo para simular)";
      return `  ${nombre}: ${tipo} = ${valor}${nota}`;
    })
    .join("\n");
}

const TEXTO_ETAPA: Record<Etapa, string> = {
  simulando: "Simulando en la red…",
  firmando: "Esperando tu firma en Freighter…",
  enviando: "Enviando la transacción…",
  confirmando: "Esperando la confirmación del ledger…",
};

type Estado =
  | { tipo: "inicial" }
  | { tipo: "en-curso"; etapa: Etapa }
  | { tipo: "simulada" }
  | { tipo: "confirmada"; hash: string; ledger: number }
  | { tipo: "error"; error: unknown };

function Rechazo({ error, invocacion }: { error: unknown; invocacion: Invocacion }) {
  if (error instanceof ErrorTransaccion) {
    const { motivo, etapa } = error;
    const antesDeFirmar = etapa === "simulando";
    if (motivo.tipo === "contrato") {
      return (
        <div className="aviso aviso--peligro" role="alert">
          <p style={{ marginBottom: "0.25rem" }}>
            <strong>
              El contrato rechaza la operación
              {antesDeFirmar ? " (en la simulación: no se pidió ninguna firma)" : ""}.
            </strong>
          </p>
          <TextoMotivo motivo={{ tipo: "contrato", codigo: motivo.codigo }} prefijo={`Error del contrato #${motivo.numero}`} />
        </div>
      );
    }
    if (motivo.tipo === "autorizacion" && invocacion.firma) {
      return (
        <p className="aviso aviso--peligro" role="alert">
          <strong>Error de autorización:</strong> esta operación la tiene que firmar el{" "}
          {NOMBRE_ROL[invocacion.firma.rol].toLowerCase()} (<code>{invocacion.firma.direccion}</code>) y esta
          cuenta no puede hacerlo. {antesDeFirmar ? "No se pidió ninguna firma." : ""}
        </p>
      );
    }
    return (
      <p className="aviso aviso--peligro" role="alert">
        {describirRechazo(motivo)}
        {antesDeFirmar ? " No se pidió ninguna firma." : ""}
        {error.hash ? ` Transacción ${error.hash}.` : ""}
      </p>
    );
  }
  return (
    <p className="aviso aviso--peligro" role="alert">
      {error instanceof Error ? error.message : "No se pudo completar la operación."}
    </p>
  );
}

/**
 * Lo que se enviaría al contrato. Con `envio` (modo API y red configurada) además se puede simular
 * en la red y, con Freighter en testnet, firmar y enviar. `soloSimular`: para "probar con el
 * contrato" una acción que el panel muestra como no permitida; simula apenas se abre.
 */
export function VistaInvocacion({
  invocacion,
  alCerrar,
  envio = null,
  soloSimular = false,
}: {
  invocacion: Invocacion;
  alCerrar: () => void;
  envio?: ContextoEnvio | null;
  soloSimular?: boolean;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });

  useEffect(() => {
    titulo.current?.focus();
  }, [invocacion]);

  const pedido = envio
    ? { contratoId: envio.contratoId, funcion: invocacion.funcion, args: argumentosDe(invocacion), origen: envio.origen }
    : null;

  async function simularEnLaRed() {
    if (!envio || !pedido) return;
    setEstado({ tipo: "en-curso", etapa: "simulando" });
    try {
      await simular(envio.red, pedido);
      setEstado({ tipo: "simulada" });
    } catch (error) {
      setEstado({ tipo: "error", error });
    }
  }

  async function firmarYEnviar() {
    if (!envio?.firmar || !pedido) return;
    try {
      const r = await enviar(envio.red, {
        ...pedido,
        firmar: envio.firmar,
        alAvanzar: (etapa) => setEstado({ tipo: "en-curso", etapa }),
      });
      setEstado({ tipo: "confirmada", hash: r.hash, ledger: r.ledger });
    } catch (error) {
      setEstado({ tipo: "error", error });
    }
  }

  useEffect(() => {
    // Solo al abrir: la invocación de "probar" no cambia mientras la vista está abierta.
    if (soloSimular) void simularEnLaRed();
  }, []);

  const enCurso = estado.tipo === "en-curso";
  const confirmada = estado.tipo === "confirmada";
  const urlTx = estado.tipo === "confirmada" ? envio?.urlTransaccion(estado.hash) : null;

  return (
    <section className="invocacion" aria-label="Lo que se enviaría al contrato">
      <h4 ref={titulo} tabIndex={-1}>
        {soloSimular ? "Prueba contra el contrato" : "Lo que se enviaría"}: <code>{invocacion.funcion}</code>
      </h4>
      <pre>{`${invocacion.funcion}(\n${textoArgumentos(invocacion)}\n)`}</pre>
      <p className="chico">
        {invocacion.firma ? (
          <>
            Firma requerida: {NOMBRE_ROL[invocacion.firma.rol].toLowerCase()} (<code>{invocacion.firma.direccion}</code>).
          </>
        ) : (
          <>
            No pide la firma de un rol: la puede enviar cualquier cuenta (paga la comisión) y el pago va
            siempre al contratista de la obra.
          </>
        )}
      </p>

      {envio ? (
        <>
          <div className="fila">
            <button type="button" className="boton boton--secundario" onClick={simularEnLaRed} disabled={enCurso || confirmada}>
              Simular en la red
            </button>
            {!soloSimular && (
              <button
                type="button"
                className="boton"
                onClick={firmarYEnviar}
                disabled={!envio.firmar || enCurso || confirmada}
              >
                Firmar con Freighter y enviar
              </button>
            )}
          </div>
          {!soloSimular && !envio.firmar && envio.motivoSinFirma && (
            <p className="motivo">No se puede firmar: {envio.motivoSinFirma}</p>
          )}
          <div aria-live="polite" style={{ marginTop: "0.5rem" }}>
            {estado.tipo === "en-curso" && <p className="chico">{TEXTO_ETAPA[estado.etapa]}</p>}
            {estado.tipo === "simulada" && (
              <p className="aviso aviso--info chico">La simulación pasó: el contrato aceptaría esta operación ahora.</p>
            )}
            {estado.tipo === "confirmada" && (
              <p className="aviso aviso--info chico" role="status">
                <strong>Confirmada en el ledger {estado.ledger}.</strong> Transacción{" "}
                {urlTx ? (
                  <a href={urlTx} target="_blank" rel="noreferrer">
                    <code>{estado.hash}</code>
                  </a>
                ) : (
                  <code>{estado.hash}</code>
                )}
                . El tablero se actualiza en unos segundos.
              </p>
            )}
            {estado.tipo === "error" && <Rechazo error={estado.error} invocacion={invocacion} />}
          </div>
        </>
      ) : (
        <p className="chico">
          <strong>Vista previa:</strong> no se firmó ni se envió nada (en modo mock, o sin la red configurada).
        </p>
      )}

      <button type="button" className="boton boton--secundario" onClick={alCerrar} style={{ marginTop: "0.5rem" }}>
        Cerrar
      </button>
    </section>
  );
}
