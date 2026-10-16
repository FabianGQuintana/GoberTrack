"use client";

import { useId, useState } from "react";
import { construirInvocacion, type Invocacion } from "@/lib/invocaciones";
import { aUnidades, formatearMonto, parsearMonto } from "@/lib/montos";
import { evaluarFondear, type Contexto } from "@/lib/reglas";
import type { ContextoEnvio } from "./envio";
import { TextoMotivo } from "./TextoMotivo";
import { VistaInvocacion } from "./VistaInvocacion";

/** §3.2 fondear(obra, monto): el municipio deposita fondos, con tope en el presupuesto vigente. */
export function AccionFondear({ ctx, envio = null }: { ctx: Contexto; envio?: ContextoEnvio | null }) {
  const { obra } = ctx;
  const id = useId();
  const [texto, setTexto] = useState("");
  const [invocacion, setInvocacion] = useState<Invocacion | null>(null);
  const [prueba, setPrueba] = useState(false);
  const [apertura, setApertura] = useState(0);

  const monto = parsearMonto(texto);
  const resultado = evaluarFondear(ctx, monto);
  const esMunicipio = ctx.roles.includes("municipio");
  const disponible = aUnidades(obra.monto_vigente) - aUnidades(obra.fondeado);

  return (
    <div className="accion">
      <h3>Fondear la obra</h3>
      <p className="chico suave">
        Firma: municipio. Fondeado {formatearMonto(obra.fondeado, true)} de{" "}
        {formatearMonto(obra.monto_vigente, true)}; se puede fondear hasta{" "}
        {formatearMonto(disponible, true)} más.
      </p>
      {esMunicipio && (
        <div className="campo" style={{ maxWidth: "22rem", marginBottom: "0.5rem" }}>
          <label htmlFor={id}>Monto a depositar</label>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej.: 5000 o 5000,5"
            value={texto}
            aria-describedby={`${id}-vista`}
            onChange={(e) => {
              setTexto(e.target.value);
              setInvocacion(null);
              setPrueba(false);
            }}
          />
          <span className="chico suave" id={`${id}-vista`} aria-live="polite">
            {texto === ""
              ? "Hasta 7 decimales, con coma o punto."
              : monto === null
                ? "No es un monto válido (hasta 7 decimales, sin separador de miles)."
                : `= ${formatearMonto(monto, true)}`}
          </span>
        </div>
      )}
      <button
        type="button"
        className="boton"
        disabled={!resultado.permitida}
        aria-describedby={!resultado.permitida ? `${id}-motivo` : undefined}
        onClick={() => {
          if (monto === null) return;
          setPrueba(false);
          setApertura((n) => n + 1);
          setInvocacion(construirInvocacion(obra, { accion: "fondear", monto }));
        }}
      >
        Fondear la obra
      </button>
      {!resultado.permitida && <TextoMotivo motivo={resultado.motivo} id={`${id}-motivo`} />}
      {!resultado.permitida && envio && monto !== null && monto > 0n && (
        <button
          type="button"
          className="boton boton--secundario chico"
          style={{ marginTop: "0.4rem" }}
          onClick={() => {
            setPrueba(true);
            setApertura((n) => n + 1);
          setInvocacion(construirInvocacion(obra, { accion: "fondear", monto }));
          }}
        >
          Probar igual con el contrato<span className="visualmente-oculto">: fondear la obra</span> (simulación, sin firmar)
        </button>
      )}
      {invocacion && (
        <VistaInvocacion
          key={`${apertura}-${prueba}-${invocacion.argumentos.map((a) => a.valor).join(",")}`}
          invocacion={invocacion}
          envio={envio}
          soloSimular={prueba}
          alCerrar={() => setInvocacion(null)}
        />
      )}
    </div>
  );
}
