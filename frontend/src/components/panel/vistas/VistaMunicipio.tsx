"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { avisosDeObra } from "@/lib/atencion";
import { aUnidades, DECIMALES, formatearMonto, parsearMonto, SIMBOLO_TOKEN } from "@/lib/montos";
import { evaluarFondear } from "@/lib/reglas";
import { EstadoInsignia, Insignia } from "../../ui/Insignia";
import { BotonAccion } from "../BotonAccion";
import { probador, type ContextoVista } from "../contexto";
import { CrearObra } from "../CrearObra";
import { pedidoFondear } from "../pedidos";
import { TarjetaProximaAccion } from "../TarjetaProximaAccion";

/** Unidades mínimas → texto editable que acepta `parsearMonto` ("10000" o "10000,5"). */
export function montoEditable(unidades: bigint): string {
  const escala = 10n ** BigInt(DECIMALES);
  const entero = (unidades / escala).toString();
  const fraccion = (unidades % escala).toString().padStart(DECIMALES, "0").replace(/0+$/, "");
  return fraccion ? `${entero},${fraccion}` : entero;
}

function Fondear({ v }: { v: ContextoVista }) {
  const id = useId();
  const faltante = aUnidades(v.obra.monto_vigente) - aUnidades(v.obra.fondeado);
  const [texto, setTexto] = useState(faltante > 0n ? montoEditable(faltante) : "");
  const monto = parsearMonto(texto);
  const resultado = evaluarFondear(v.ctx, monto);
  const porPagar = aUnidades(v.obra.monto_vigente) - aUnidades(v.obra.pagado);

  return (
    <TarjetaProximaAccion
      titulo={faltante > 0n ? `Depositá los fondos que faltan en ${v.obra.nombre}` : `${v.obra.nombre} tiene todos los fondos depositados`}
      descripcion={
        faltante > 0n
          ? `Hay ${formatearMonto(v.obra.saldo, true)} depositados sin pagar y quedan ${formatearMonto(porPagar, true)} por pagar en los hitos pendientes. Para cubrir el presupuesto vigente faltan ${formatearMonto(faltante, true)}.`
          : "El contrato ya tiene todo el presupuesto vigente. No hace falta depositar más."
      }
    >
      {faltante > 0n && (
        <div className="grilla" style={{ ["--min" as string]: "340px", alignItems: "end" }}>
          <div className="campo">
            <label htmlFor={id}>Monto a depositar</label>
            <div className="fila" style={{ flexWrap: "nowrap" }}>
              <input
                id={id}
                className="entrada entrada--monto"
                inputMode="decimal"
                autoComplete="off"
                value={texto}
                aria-describedby={`${id}-ayuda`}
                aria-invalid={texto !== "" && monto === null}
                onChange={(e) => setTexto(e.target.value)}
                style={{ fontSize: 18, fontWeight: 600 }}
              />
              <b>{SIMBOLO_TOKEN}</b>
            </div>
            <span className="chico suave" id={`${id}-ayuda`} aria-live="polite">
              {texto !== "" && monto === null
                ? "No es un monto válido: hasta 7 decimales, con coma o punto y sin separador de miles."
                : monto !== null
                  ? `= ${formatearMonto(monto, true)}. Podés depositar hasta ${formatearMonto(faltante, true)}: es lo que falta para llegar al total vigente.`
                  : `Podés depositar hasta ${formatearMonto(faltante, true)}.`}
            </span>
          </div>
          <div className="pila" style={{ alignItems: "flex-start" }}>
            {monto !== null && monto > 0n && (
              <span className="chico suave">
                Después de depositar, el saldo bloqueado pasa de {formatearMonto(v.obra.saldo, true)} a{" "}
                {formatearMonto(aUnidades(v.obra.saldo) + monto, true)}.
              </span>
            )}
            <BotonAccion
              etiqueta="Depositar y firmar"
              icono="wallet"
              resultado={resultado}
              alAccionar={() => monto !== null && v.abrir(pedidoFondear(v.obra, monto))}
              alProbar={monto !== null && monto > 0n ? probador(v, () => pedidoFondear(v.obra, monto)) : undefined}
            />
          </div>
        </div>
      )}
    </TarjetaProximaAccion>
  );
}

function ResumenFinanciero({ v }: { v: ContextoVista }) {
  const mias = v.todas.filter((o) => o.obra.municipio.toUpperCase() === v.direccion.toUpperCase());
  const suma = (campo: "monto_vigente" | "fondeado" | "pagado" | "saldo") =>
    mias.reduce((s, o) => s + aUnidades(o.obra[campo]), 0n);
  return (
    <section className="tarjeta tarjeta--grande pila" aria-labelledby="titulo-resumen" style={{ gap: 18 }}>
      <div className="pila pila--chica">
        <h2 id="titulo-resumen">Resumen financiero de tus obras</h2>
        <p className="suave">Lo que figura en el contrato, obra por obra.</p>
      </div>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Obra</th>
              <th scope="col">Estado</th>
              <th scope="col" className="num">
                Presupuesto
              </th>
              <th scope="col" className="num">
                Depositado
              </th>
              <th scope="col" className="num">
                Pagado
              </th>
              <th scope="col" className="num">
                Bloqueado
              </th>
            </tr>
          </thead>
          <tbody>
            {mias.map(({ obra, hitos }) => {
              const falta = aUnidades(obra.monto_vigente) - aUnidades(obra.fondeado);
              const atencion = avisosDeObra(obra, hitos, [], { ahora: v.ahora }).length > 0;
              return (
                <tr key={obra.id}>
                  <td>
                    <Link href={`/panel/${obra.id}?vista=municipio`} style={{ fontWeight: 600 }}>
                      {obra.nombre}
                    </Link>
                    {falta > 0n && <div className="chico suave">Faltan depositar {formatearMonto(falta, true)}</div>}
                  </td>
                  <td>
                    {atencion ? (
                      <Insignia tono="ob" icono="alerta">
                        Requiere atención
                      </Insignia>
                    ) : (
                      <EstadoInsignia estado={obra.estado} />
                    )}
                  </td>
                  <td className="num">{formatearMonto(obra.monto_vigente, true)}</td>
                  <td className="num">{formatearMonto(obra.fondeado, true)}</td>
                  <td className="num">{formatearMonto(obra.pagado, true)}</td>
                  <td className="num">
                    <b>{formatearMonto(obra.saldo, true)}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td />
              <td className="num">{formatearMonto(suma("monto_vigente"), true)}</td>
              <td className="num">{formatearMonto(suma("fondeado"), true)}</td>
              <td className="num">{formatearMonto(suma("pagado"), true)}</td>
              <td className="num">{formatearMonto(suma("saldo"), true)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export function VistaMunicipio({ v }: { v: ContextoVista }) {
  return (
    <>
      <Fondear v={v} />
      <ResumenFinanciero v={v} />
      <CrearObra v={v} />
    </>
  );
}
