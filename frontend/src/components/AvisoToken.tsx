import { cliente } from "@/lib/api/cliente";
import type { Obra } from "@/lib/api/tipos";
import { abreviarDireccion } from "@/lib/roles";
import { tokenOficial, verificarToken, type VerificacionToken } from "@/lib/token";

export function verificarTokenDeObra(obra: Pick<Obra, "token">): VerificacionToken {
  return verificarToken(obra.token, tokenOficial(cliente.modo));
}

/**
 * Destaca una obra que no usa el token oficial (contract.md v1.1 §0). `compacto` para la tarjeta del
 * listado; completo para el detalle y el panel.
 */
export function AvisoToken({ obra, compacto = false }: { obra: Pick<Obra, "token">; compacto?: boolean }) {
  const { estado, oficial } = verificarTokenDeObra(obra);
  if (estado === "oficial") return null;
  if (estado === "sin-verificar") {
    return compacto ? null : (
      <p className="aviso aviso--info chico" role="note">
        No se configuró el token oficial de la demo (<code>NEXT_PUBLIC_TOKEN_SAC</code>): no se puede
        verificar el token de esta obra (<code>{obra.token}</code>).
      </p>
    );
  }
  if (compacto) {
    return (
      <p className="aviso aviso--peligro chico" role="note">
        <strong>⚠ Token no oficial.</strong> Esta obra no usa el token de la demo: sus pagos pueden no
        valer nada.
      </p>
    );
  }
  return (
    <div className="aviso aviso--peligro" role="note">
      <p>
        <strong>⚠ Esta obra no usa el token oficial de la demo.</strong> El contrato acepta cualquier
        token, así que con uno sin valor un hito puede figurar como «Pagado» sin que el contratista
        reciba nada. Los montos de esta obra no están en el token oficial.
      </p>
      <p className="chico" style={{ marginBottom: 0 }}>
        Token de la obra: <code>{obra.token}</code>
        <br />
        Token oficial (SAC): <code title={oficial ?? undefined}>{oficial ? abreviarDireccion(oficial, 6) : "—"}</code>
      </p>
    </div>
  );
}
