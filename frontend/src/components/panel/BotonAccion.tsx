"use client";

import { useId } from "react";
import type { Resultado } from "@/lib/reglas";
import { Icono, type NombreIcono } from "../ui/Icono";
import { LineaMotivo, MotivoRegla } from "../ui/Motivo";

/**
 * Botón de una acción firmable. Si las reglas (espejo del contrato) no la permiten, queda
 * deshabilitado con el motivo al lado; y, si hay red, ofrece "Probar igual con el contrato" para la
 * demo: así se ve que la regla la aplica el contrato y no solo la pantalla.
 * `faltante`: otra condición de la pantalla (p. ej. "Falta subir el documento con el motivo").
 */
export function BotonAccion({
  etiqueta,
  resultado,
  alAccionar,
  alProbar,
  faltante,
  icono,
  variante = "primario",
  probarVisible = true,
}: {
  etiqueta: string;
  resultado: Resultado;
  alAccionar: () => void;
  alProbar?: () => void;
  faltante?: string | null;
  icono?: NombreIcono;
  variante?: "primario" | "secundario" | "peligro";
  probarVisible?: boolean;
}) {
  const id = useId();
  const permitida = resultado.permitida;
  const habilitado = permitida && !faltante;
  const clase = variante === "primario" ? " boton--primario" : variante === "peligro" ? " boton--peligro" : "";
  return (
    <div className="pila pila--chica" style={{ alignItems: "flex-start" }}>
      <button
        type="button"
        className={`boton${clase}`}
        disabled={!habilitado}
        aria-describedby={!habilitado ? `${id}-motivo` : undefined}
        onClick={alAccionar}
      >
        {icono && <Icono nombre={icono} />}
        {etiqueta}
      </button>
      {!permitida ? (
        <MotivoRegla motivo={resultado.motivo} id={`${id}-motivo`} />
      ) : faltante ? (
        <LineaMotivo id={`${id}-motivo`}>{faltante}</LineaMotivo>
      ) : null}
      {!permitida && alProbar && probarVisible && (
        <>
          <button type="button" className="boton boton--discontinuo" onClick={alProbar}>
            Probar igual con el contrato<span className="visualmente-oculto">: {etiqueta}</span>
          </button>
          <span className="chico suave">Solo para la demo: muestra que la regla la aplica el contrato y no solo la pantalla.</span>
        </>
      )}
    </div>
  );
}
