"use client";

import { useId, useState } from "react";
import { cliente } from "@/lib/api/cliente";
import { ERRORES } from "@/lib/errores";
import { formatearMonto, SIMBOLO_TOKEN } from "@/lib/montos";
import { validarNuevaObra, type FormularioObra } from "@/lib/nuevaObra";
import { leerConfigRed } from "@/lib/stellar/config";
import { formatearPeriodo } from "@/lib/tiempo";
import { Icono } from "../ui/Icono";
import { LineaMotivo } from "../ui/Motivo";
import type { ContextoVista } from "./contexto";
import { pedidoCrearObra } from "./pedidos";

/** DATO SIMULADO: en la demo el período de objeción es de 1 minuto; en la realidad serían días. */
const PERIODO_DEMO_SEG = 60;

const HITOS_INICIALES = [
  { descripcion: "", monto: "" },
  { descripcion: "", monto: "" },
  { descripcion: "", monto: "" },
  { descripcion: "", monto: "" },
];

/**
 * "Crear una obra nueva" (crear_obra, contract.md §3.1). Firma el municipio conectado; el token es el
 * oficial de la demo. Los errores del formulario siguen el orden del contrato (RolesDuplicados y
 * después MontoInvalido).
 */
export function CrearObra({ v }: { v: ContextoVista }) {
  const id = useId();
  const [f, setF] = useState<FormularioObra>({
    municipio: v.direccion,
    nombre: "",
    contratista: "",
    inspector: "",
    veedor: "",
    arbitro: v.direccion,
    hitos: HITOS_INICIALES,
  });
  const [periodo, setPeriodo] = useState(String(PERIODO_DEMO_SEG));
  const validacion = validarNuevaObra({ ...f, municipio: v.direccion });
  const periodoSeg = /^[0-9]{1,9}$/.test(periodo) ? Number(periodo) : null;
  const config = leerConfigRed();
  const token = config.ok ? config.config.tokenSac : null;
  const total = validacion.ok ? validacion.total : null;

  const campoError = !validacion.ok ? validacion.campo : null;
  const error = (campo: string) =>
    campoError === campo && !validacion.ok ? (
      <span className="error-campo" id={`${id}-${campo}-error`}>
        <Icono nombre="alerta" tamano={16} />
        {validacion.mensaje}
      </span>
    ) : null;
  const cambiar = (clave: keyof FormularioObra, valor: string) => setF((x) => ({ ...x, [clave]: valor }));
  const cambiarHito = (i: number, clave: "descripcion" | "monto", valor: string) =>
    setF((x) => ({ ...x, hitos: x.hitos.map((h, j) => (j === i ? { ...h, [clave]: valor } : h)) }));

  const motivoBloqueo = !validacion.ok
    ? `${validacion.mensaje}${validacion.codigo ? ` (${validacion.codigo}: ${ERRORES[validacion.codigo].mensaje})` : ""}`
    : periodoSeg === null
      ? "El período de objeción tiene que ser un número de segundos"
      : cliente.modo === "api" && !token
        ? "Falta configurar el token oficial (NEXT_PUBLIC_TOKEN_SAC)"
        : null;

  function crear() {
    if (!validacion.ok || periodoSeg === null) return;
    const datos = {
      municipio: v.direccion,
      nombre: f.nombre.trim(),
      contratista: f.contratista.trim(),
      inspector: f.inspector.trim(),
      veedor: f.veedor.trim(),
      arbitro: f.arbitro.trim(),
      token: token ?? v.obra.token,
      hitos: validacion.hitos,
      periodoObjecion: periodoSeg,
    };
    v.abrir(pedidoCrearObra(datos, validacion.total));
  }

  const roles: { clave: "contratista" | "inspector" | "veedor" | "arbitro"; etiqueta: string; ayuda?: string }[] = [
    { clave: "contratista", etiqueta: "Contratista" },
    { clave: "inspector", etiqueta: "Inspector" },
    { clave: "veedor", etiqueta: "Veedor independiente" },
    {
      clave: "arbitro",
      etiqueta: "Árbitro",
      ayuda:
        f.arbitro.trim().toUpperCase() === v.direccion.toUpperCase()
          ? "Es la misma dirección que la tuya: vas a ser municipio y árbitro a la vez (limitación de esta versión)."
          : undefined,
    },
  ];

  return (
    <section className="tarjeta tarjeta--grande pila pila--grande" aria-labelledby={`${id}-titulo`}>
      <div className="pila pila--chica" style={{ maxWidth: 760 }}>
        <h2 id={`${id}-titulo`}>Crear una obra nueva</h2>
        <p className="suave">Una vez creada, los participantes, los hitos y los montos quedan registrados y no se pueden modificar.</p>
      </div>

      <div className="campo" style={{ maxWidth: 560 }}>
        <label htmlFor={`${id}-nombre`}>Nombre de la obra</label>
        <input
          id={`${id}-nombre`}
          className="entrada"
          value={f.nombre}
          onChange={(e) => cambiar("nombre", e.target.value)}
          aria-invalid={campoError === "nombre" && f.nombre !== ""}
          aria-describedby={campoError === "nombre" ? `${id}-nombre-error` : undefined}
        />
        {f.nombre !== "" && error("nombre")}
      </div>

      <div className="pila" style={{ gap: 14 }}>
        <h3>Quiénes participan</h3>
        <div className="grilla" style={{ ["--min" as string]: "440px", gap: 16 }}>
          <div className="campo">
            <label htmlFor={`${id}-municipio`}>Municipio (vos)</label>
            <input id={`${id}-municipio`} className="entrada entrada--mono" readOnly value={v.direccion} />
          </div>
          {roles.map((r) => (
            <div key={r.clave} className="campo">
              <label htmlFor={`${id}-${r.clave}`}>{r.etiqueta}</label>
              <input
                id={`${id}-${r.clave}`}
                className="entrada entrada--mono"
                placeholder="Pegá la dirección que empieza con G"
                value={f[r.clave]}
                onChange={(e) => cambiar(r.clave, e.target.value)}
                aria-invalid={campoError === r.clave && f[r.clave] !== ""}
                aria-describedby={campoError === r.clave ? `${id}-${r.clave}-error` : undefined}
                autoComplete="off"
                spellCheck={false}
              />
              {f[r.clave] !== "" && error(r.clave)}
              {r.ayuda && <span className="chico suave">{r.ayuda}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="pila" style={{ gap: 14 }}>
        <div className="fila fila--entre">
          <h3>Hitos de pago</h3>
          <span className="chico suave">Normalmente son 4. Se pagan en orden. Montos en {SIMBOLO_TOKEN}, sin separador de miles.</span>
        </div>
        <ol className="lista-limpia pila">
          {f.hitos.map((h, i) => (
            <li key={i} className="fila" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <b style={{ width: 28, textAlign: "center", paddingTop: 10 }} aria-hidden="true">
                {i + 1}
              </b>
              <div className="pila pila--chica" style={{ flex: 1 }}>
                <div className="fila" style={{ flexWrap: "wrap" }}>
                  <input
                    className="entrada"
                    style={{ flex: "2 1 220px" }}
                    aria-label={`Descripción del hito ${i + 1}`}
                    value={h.descripcion}
                    onChange={(e) => cambiarHito(i, "descripcion", e.target.value)}
                  />
                  <input
                    className="entrada entrada--monto"
                    style={{ flex: "1 1 160px" }}
                    aria-label={`Monto del hito ${i + 1}`}
                    inputMode="decimal"
                    placeholder="Ej.: 6000"
                    value={h.monto}
                    onChange={(e) => cambiarHito(i, "monto", e.target.value)}
                  />
                </div>
                {(h.descripcion !== "" || h.monto !== "") && error(`hito-${i}`)}
              </div>
              <button
                type="button"
                className="boton"
                style={{ minWidth: 44, padding: 0 }}
                aria-label={`Quitar hito ${i + 1}`}
                disabled={f.hitos.length <= 1}
                onClick={() => setF((x) => ({ ...x, hitos: x.hitos.filter((_, j) => j !== i) }))}
              >
                <Icono nombre="papelera" />
              </button>
            </li>
          ))}
        </ol>
        <div className="fila fila--entre">
          <button
            type="button"
            className="boton"
            onClick={() => setF((x) => ({ ...x, hitos: [...x.hitos, { descripcion: "", monto: "" }] }))}
          >
            <Icono nombre="mas" />
            Agregar hito
          </button>
          <div style={{ textAlign: "right" }}>
            <div className="etiqueta">Presupuesto total</div>
            <div className="cifra" style={{ fontSize: 20 }}>
              {total !== null ? formatearMonto(total, true) : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="campo" style={{ maxWidth: 360 }}>
        <label htmlFor={`${id}-periodo`}>Período de objeción (segundos)</label>
        <input
          id={`${id}-periodo`}
          className="entrada entrada--monto"
          inputMode="numeric"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
        />
        <span className="chico suave">
          {periodoSeg !== null ? `${formatearPeriodo(periodoSeg)}. ` : ""}DATO SIMULADO: en la demo es 1 minuto; en una obra real serían días.
        </span>
      </div>

      <div className="pila pila--chica" style={{ alignItems: "flex-start", borderTop: "1px solid var(--ln)", paddingTop: 20 }}>
        <button
          type="button"
          className="boton boton--primario"
          disabled={motivoBloqueo !== null}
          aria-describedby={motivoBloqueo ? `${id}-bloqueo` : undefined}
          onClick={crear}
        >
          <Icono nombre="mas" />
          Crear obra y firmar
        </button>
        {motivoBloqueo && <LineaMotivo id={`${id}-bloqueo`}>{motivoBloqueo}</LineaMotivo>}
      </div>
    </section>
  );
}
