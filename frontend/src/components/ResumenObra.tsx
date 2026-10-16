import type { Obra } from "@/lib/api/tipos";
import { formatearMonto, porcentaje, SIMBOLO_TOKEN } from "@/lib/montos";
import { verificarTokenDeObra } from "./AvisoToken";

export function ResumenObra({ obra }: { obra: Obra }) {
  const avance = porcentaje(obra.pagado, obra.monto_vigente);
  const cambioPresupuesto = obra.monto_original !== obra.monto_vigente;
  const { estado: estadoToken } = verificarTokenDeObra(obra);
  return (
    <div className="pila">
      <dl className="cifras">
        <div className="cifra">
          <dt>Presupuesto original</dt>
          <dd>{formatearMonto(obra.monto_original)}</dd>
        </div>
        <div className={`cifra${cambioPresupuesto ? " cifra--destacada" : ""}`}>
          <dt>Presupuesto vigente{cambioPresupuesto ? " (con adendas)" : ""}</dt>
          <dd>{formatearMonto(obra.monto_vigente)}</dd>
        </div>
        <div className="cifra">
          <dt>Fondeado por el municipio</dt>
          <dd>{formatearMonto(obra.fondeado)}</dd>
        </div>
        <div className="cifra">
          <dt>Pagado al contratista</dt>
          <dd>{formatearMonto(obra.pagado)}</dd>
        </div>
        <div className="cifra cifra--destacada">
          <dt>Saldo bloqueado en el contrato</dt>
          <dd>{formatearMonto(obra.saldo)}</dd>
        </div>
      </dl>
      <p className="suave chico">
        {estadoToken === "no-oficial" ? (
          <strong className="marca-objeto">Montos en un token que NO es el oficial de la demo.</strong>
        ) : estadoToken === "oficial" ? (
          <>Montos en {SIMBOLO_TOKEN} (token oficial de la demo).</>
        ) : (
          <>Montos en el token de la obra (sin verificar contra el oficial).</>
        )}{" "}
        Token: <code>{obra.token}</code>
      </p>
      <div>
        <p className="chico" id={`avance-${obra.id}`}>
          Pagado: {avance.toLocaleString("es-AR")} % del presupuesto vigente · {obra.hitos_pagados} de{" "}
          {obra.cantidad_hitos} hitos pagados
        </p>
        <div
          className="barra"
          role="progressbar"
          aria-labelledby={`avance-${obra.id}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={avance}
        >
          <div className="barra__pagado" style={{ width: `${Math.min(100, avance)}%` }} />
        </div>
      </div>
    </div>
  );
}
