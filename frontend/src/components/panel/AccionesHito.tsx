"use client";

import { useId, useState } from "react";
import { EstadoEtiqueta } from "@/components/EstadoEtiqueta";
import type { Hito } from "@/lib/api/tipos";
import { construirInvocacion, type Decision, type Invocacion, type ParametrosInvocacion } from "@/lib/invocaciones";
import { formatearMonto } from "@/lib/montos";
import { evaluarHito, type AccionHito, type Contexto, type Resultado } from "@/lib/reglas";
import { HASH_DE_PRUEBA, type ContextoEnvio } from "./envio";
import { SubidaArchivo } from "./SubidaArchivo";
import { TextoMotivo } from "./TextoMotivo";
import { VistaInvocacion } from "./VistaInvocacion";

function FilaAccion({
  titulo,
  firma,
  resultado,
  alProbar,
  children,
}: {
  titulo: string;
  firma: string;
  resultado: Resultado;
  /** Si está, la acción no permitida se puede "probar igual" contra el contrato (solo simulación). */
  alProbar?: () => void;
  children: (idMotivo: string | undefined) => React.ReactNode;
}) {
  const id = useId();
  const idMotivo = resultado.permitida ? undefined : `${id}-motivo`;
  return (
    <div className="accion">
      <h4>{titulo}</h4>
      <p className="chico suave">{firma}</p>
      {children(idMotivo)}
      {!resultado.permitida && <TextoMotivo motivo={resultado.motivo} id={idMotivo} />}
      {!resultado.permitida && alProbar && (
        <button type="button" className="boton boton--secundario chico" onClick={alProbar} style={{ marginTop: "0.4rem" }}>
          Probar igual con el contrato<span className="visualmente-oculto">: {titulo}</span> (simulación, sin firmar)
        </button>
      )}
    </div>
  );
}

/** Las cinco acciones sobre un hito, cada una habilitada o con el error que devolvería el contrato. */
export function AccionesHito({
  ctx,
  hito,
  direccion,
  envio = null,
}: {
  ctx: Contexto;
  hito: Hito;
  /** Dirección que firmaría (la conectada o la simulada). */
  direccion: string;
  /** Envío a la red (modo API con red configurada); null = solo vista previa. */
  envio?: ContextoEnvio | null;
}) {
  const { obra, roles } = ctx;
  const indice = hito.indice;
  const numero = indice + 1;
  const evaluacion = evaluarHito(ctx, indice);
  const [hashEvidencia, setHashEvidencia] = useState<string | null>(null);
  const [hashMotivo, setHashMotivo] = useState<string | null>(null);
  const [invocacion, setInvocacion] = useState<Invocacion | null>(null);
  const [prueba, setPrueba] = useState<Invocacion | null>(null);
  // Revisión R6: cada clic abre una vista nueva (sin el resultado de la acción o decisión anterior).
  const [apertura, setApertura] = useState(0);

  const rolAprobador = roles.includes("inspector") ? "inspector" : "veedor";
  const mostrar = (p: ParametrosInvocacion) => {
    setPrueba(null);
    setApertura((n) => n + 1);
    setInvocacion(construirInvocacion(obra, p));
  };
  const resolver = (decision: Decision) => mostrar({ accion: "resolver_objecion", hito: indice, decision });

  /** Invocación para probar una acción no permitida: con hashes de relleno si todavía no se subieron. */
  const parametrosDePrueba = (accion: AccionHito): ParametrosInvocacion => {
    switch (accion) {
      case "declarar_hito":
        return { accion, hito: indice, evidenciaHash: hashEvidencia ?? HASH_DE_PRUEBA };
      case "aprobar":
        return { accion, hito: indice, firmante: direccion, rolFirmante: rolAprobador };
      case "objetar":
        return { accion, hito: indice, motivoHash: hashMotivo ?? HASH_DE_PRUEBA };
      case "resolver_objecion":
        return { accion, hito: indice, decision: "Aceptar" };
      case "liberar_pago":
        return { accion, hito: indice };
    }
  };
  const probar = (accion: AccionHito) =>
    envio
      ? () => {
          setInvocacion(null);
          setApertura((n) => n + 1);
          setPrueba(construirInvocacion(obra, parametrosDePrueba(accion)));
        }
      : undefined;

  return (
    <div>
      <p className="fila chico">
        <EstadoEtiqueta estado={hito.estado} />
        <span>
          Monto vigente: <span className="monto">{formatearMonto(hito.monto_vigente, true)}</span>
        </span>
      </p>

      <FilaAccion
        titulo={`Declarar el hito ${numero}`}
        firma="Firma: contratista. Arranca el período de objeción."
        resultado={evaluacion.declarar_hito}
        alProbar={probar("declarar_hito")}
      >
        {(idMotivo) =>
          evaluacion.declarar_hito.permitida ? (
            <div className="pila">
              <SubidaArchivo etiqueta="evidencia" alObtenerHash={setHashEvidencia} />
              <div>
                <button
                  type="button"
                  className="boton"
                  disabled={!hashEvidencia}
                  onClick={() =>
                    hashEvidencia && mostrar({ accion: "declarar_hito", hito: indice, evidenciaHash: hashEvidencia })
                  }
                >
                  Declarar hito {numero}
                </button>
                {!hashEvidencia && <p className="motivo">Primero subí la evidencia para obtener su hash.</p>}
              </div>
            </div>
          ) : (
            <button type="button" className="boton" disabled aria-describedby={idMotivo}>
              Declarar hito {numero}
            </button>
          )
        }
      </FilaAccion>

      <FilaAccion
        titulo={`Aprobar el hito ${numero}`}
        firma="Firma: inspector o veedor (cada uno una vez por declaración)."
        resultado={evaluacion.aprobar}
        alProbar={probar("aprobar")}
      >
        {(idMotivo) => (
          <button
            type="button"
            className="boton"
            disabled={!evaluacion.aprobar.permitida}
            aria-describedby={idMotivo}
            onClick={() => mostrar({ accion: "aprobar", hito: indice, firmante: direccion, rolFirmante: rolAprobador })}
          >
            Aprobar hito {numero}
          </button>
        )}
      </FilaAccion>

      <FilaAccion
        titulo={`Objetar el hito ${numero}`}
        firma="Firma: veedor, solo dentro del período y si todavía no decidió."
        resultado={evaluacion.objetar}
        alProbar={probar("objetar")}
      >
        {(idMotivo) =>
          evaluacion.objetar.permitida ? (
            <div className="pila">
              <SubidaArchivo etiqueta="motivo de la objeción" alObtenerHash={setHashMotivo} />
              <div>
                <button
                  type="button"
                  className="boton"
                  disabled={!hashMotivo}
                  onClick={() => hashMotivo && mostrar({ accion: "objetar", hito: indice, motivoHash: hashMotivo })}
                >
                  Objetar hito {numero}
                </button>
                {!hashMotivo && <p className="motivo">Primero subí el documento con el motivo para obtener su hash.</p>}
              </div>
            </div>
          ) : (
            <button type="button" className="boton" disabled aria-describedby={idMotivo}>
              Objetar hito {numero}
            </button>
          )
        }
      </FilaAccion>

      <FilaAccion
        titulo={`Resolver la objeción del hito ${numero}`}
        firma="Firma: árbitro. Aceptar devuelve el hito a Pendiente; Rechazar cuenta como aprobación del veedor."
        resultado={evaluacion.resolver_objecion}
        alProbar={probar("resolver_objecion")}
      >
        {(idMotivo) => (
          <div className="fila">
            <button
              type="button"
              className="boton"
              disabled={!evaluacion.resolver_objecion.permitida}
              aria-describedby={idMotivo}
              onClick={() => resolver("Aceptar")}
            >
              Aceptar objeción del hito {numero}
            </button>
            <button
              type="button"
              className="boton boton--secundario"
              disabled={!evaluacion.resolver_objecion.permitida}
              aria-describedby={idMotivo}
              onClick={() => resolver("Rechazar")}
            >
              Rechazar objeción del hito {numero}
            </button>
          </div>
        )}
      </FilaAccion>

      <FilaAccion
        titulo={`Liberar el pago del hito ${numero}`}
        firma="Sin firma de rol: la puede enviar cualquiera; el dinero va siempre al contratista."
        resultado={evaluacion.liberar_pago}
        alProbar={probar("liberar_pago")}
      >
        {(idMotivo) => (
          <button
            type="button"
            className="boton"
            disabled={!evaluacion.liberar_pago.permitida}
            aria-describedby={idMotivo}
            onClick={() => mostrar({ accion: "liberar_pago", hito: indice })}
          >
            Liberar pago del hito {numero}
          </button>
        )}
      </FilaAccion>

      {invocacion && (
        <VistaInvocacion
          key={`${apertura}-${invocacion.funcion}-${invocacion.argumentos.map((a) => a.valor).join(",")}`}
          invocacion={invocacion}
          envio={envio}
          alCerrar={() => setInvocacion(null)}
        />
      )}
      {prueba && envio && (
        <VistaInvocacion
          key={`${apertura}-${prueba.funcion}-${prueba.argumentos.map((a) => a.valor).join(",")}`}
          invocacion={prueba}
          envio={envio}
          soloSimular
          alCerrar={() => setPrueba(null)}
        />
      )}
    </div>
  );
}
