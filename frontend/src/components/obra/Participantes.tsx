import type { Obra } from "@/lib/api/tipos";
import { NOMBRE_ROL, ROLES } from "@/lib/roles";
import { AvisoToken } from "../AvisoToken";
import { Huella } from "../ui/Huella";

const NOMBRE_COMPLETO: Record<(typeof ROLES)[number], string> = { ...NOMBRE_ROL, veedor: "Veedor independiente" };

/** Direcciones de cada rol tal como están en el contrato. */
export function Participantes({ obra }: { obra: Obra }) {
  return (
    <section className="tarjeta tarjeta--grande pila pila--chica" aria-labelledby="titulo-participantes">
      <h2 id="titulo-participantes">Participantes</h2>
      <p className="chico suave" style={{ marginBottom: 8 }}>
        Se identifican solo por su dirección en la red. Una misma dirección puede tener más de un rol.
      </p>
      <dl style={{ margin: 0 }}>
        {ROLES.map((rol) => (
          <div key={rol} className="renglon">
            <dt>
              <b>{NOMBRE_COMPLETO[rol]}</b>
              {rol === "arbitro" && obra.arbitro === obra.municipio && (
                <span className="chico suave" style={{ display: "block" }}>
                  En esta versión, la misma dirección del municipio
                </span>
              )}
            </dt>
            <dd style={{ margin: 0 }}>
              <Huella valor={obra[rol]} etiqueta={`dirección del ${NOMBRE_ROL[rol].toLowerCase()}`} />
              <span className="visualmente-oculto">{obra[rol]}</span>
            </dd>
          </div>
        ))}
        <div className="renglon">
          <dt>
            <b>Token</b>
          </dt>
          <dd style={{ margin: 0 }}>
            <Huella valor={obra.token} etiqueta="dirección del token" />
            <span className="visualmente-oculto">{obra.token}</span>
          </dd>
        </div>
      </dl>
      <AvisoToken obra={obra} compacto />
    </section>
  );
}
