import type { Obra } from "@/lib/api/tipos";
import { aUnidades, formatearMonto, porcentaje, SIMBOLO_TOKEN } from "@/lib/montos";
import type { EstadoToken } from "@/lib/token";

const TEXTO_TOKEN: Record<EstadoToken, string> = {
  oficial: `Montos en ${SIMBOLO_TOKEN} (token oficial de la demo, DATO SIMULADO).`,
  "no-oficial": "Montos en un token que NO es el oficial de la demo: pueden no valer nada.",
  "sin-verificar": "Montos en el token de la obra (sin verificar contra el oficial).",
};

/** Presupuesto, depositado, pagado y saldo, con la barra pagado / retenido / sin depositar. */
export function BloqueFondos({ obra, estadoToken }: { obra: Obra; estadoToken: EstadoToken }) {
  const simbolo = estadoToken !== "no-oficial";
  const vigente = aUnidades(obra.monto_vigente);
  const pagado = porcentaje(obra.pagado, vigente);
  const retenido = porcentaje(obra.saldo, vigente);
  const sinDepositar = Math.max(0, Math.round((100 - pagado - retenido) * 100) / 100);
  const cambio = obra.monto_original !== obra.monto_vigente;
  const cifras: [string, string][] = [
    ["Presupuesto original", obra.monto_original],
    [cambio ? "Presupuesto vigente (con adendas)" : "Presupuesto vigente", obra.monto_vigente],
    ["Depositado", obra.fondeado],
    ["Pagado", obra.pagado],
    ["Saldo bloqueado", obra.saldo],
  ];
  const texto = (n: number) => n.toLocaleString("es-AR");

  return (
    <section className="tarjeta tarjeta--grande pila" aria-label="Fondos de la obra" style={{ gap: 22 }}>
      <dl className="grilla" style={{ ["--min" as string]: "200px", gap: 20, margin: 0 }}>
        {cifras.map(([etiqueta, valor]) => (
          <div key={etiqueta}>
            <dt className="etiqueta">{etiqueta}</dt>
            <dd className="cifra" style={{ margin: 0 }}>
              {formatearMonto(valor, simbolo)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="pila" style={{ gap: 10 }}>
        <div
          className="barra barra--grande"
          role="img"
          aria-label={`${texto(pagado)} % pagado, ${texto(retenido)} % retenido en el contrato, ${texto(sinDepositar)} % sin depositar`}
        >
          <i className="barra__pagado" style={{ width: `${Math.min(100, pagado)}%` }} />
          <i style={{ width: `${Math.min(100, retenido)}%` }} />
        </div>
        <div className="fila chico suave" style={{ gap: "8px 22px" }}>
          <span className="con-icono">
            <i className="muestra" style={{ background: "var(--pab)" }} />
            Pagado al contratista · {texto(pagado)} %
          </span>
          <span className="con-icono">
            <i className="muestra" style={{ background: "var(--pr)" }} />
            Retenido en el contrato · {texto(retenido)} %
          </span>
          <span className="con-icono">
            <i className="muestra" style={{ background: "var(--peb)", border: "1px solid var(--ln)" }} />
            Falta depositar · {texto(sinDepositar)} %
          </span>
        </div>
      </div>
      <p className={`chico ${estadoToken === "no-oficial" ? "marca-alerta" : "suave"}`}>{TEXTO_TOKEN[estadoToken]}</p>
    </section>
  );
}
