import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrKey } from "@stellar/stellar-sdk/base";
import { AvisoToken, verificarTokenDeObra } from "@/components/AvisoToken";

const SAC = StrKey.encodeContract(new Uint8Array(32).fill(5));
const OTRO = StrKey.encodeContract(new Uint8Array(32).fill(6));

// Modo api con el SAC oficial configurable.
const entorno = vi.hoisted(() => ({ sac: null as string | null }));
vi.mock("@/lib/api/cliente", () => ({ cliente: { modo: "api" } }));
vi.mock("@/lib/stellar/config", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/stellar/config")>()),
  tokenSacConfigurado: () => entorno.sac,
}));

beforeEach(() => {
  entorno.sac = SAC;
});

describe("verificarTokenDeObra / AvisoToken en modo api", () => {
  it("token oficial → no muestra nada", () => {
    expect(verificarTokenDeObra({ token: SAC }).estado).toBe("oficial");
    const { container } = render(<AvisoToken obra={{ token: SAC }} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<AvisoToken obra={{ token: SAC }} compacto />);
    expect(c2).toBeEmptyDOMElement();
  });

  it("token distinto → aviso completo con ambos tokens", () => {
    expect(verificarTokenDeObra({ token: OTRO }).estado).toBe("no-oficial");
    render(<AvisoToken obra={{ token: OTRO }} />);
    const aviso = screen.getByRole("note");
    expect(aviso).toHaveTextContent("Esta obra no usa el token oficial de la demo");
    expect(aviso).toHaveTextContent(OTRO);
    expect(aviso.querySelector("code[title]")).toHaveAttribute("title", SAC);
  });

  it("token distinto, compacto → aviso corto", () => {
    render(<AvisoToken obra={{ token: OTRO }} compacto />);
    expect(screen.getByRole("note")).toHaveTextContent("Token no oficial.");
  });

  it("sin SAC configurado → completo avisa que no se puede verificar; compacto no dice nada", () => {
    entorno.sac = null;
    expect(verificarTokenDeObra({ token: SAC })).toEqual({ estado: "sin-verificar", oficial: null });
    render(<AvisoToken obra={{ token: SAC }} />);
    expect(screen.getByRole("note")).toHaveTextContent(/NEXT_PUBLIC_TOKEN_SAC.*no se puede verificar/s);
    const { container } = render(<AvisoToken obra={{ token: SAC }} compacto />);
    expect(container).toBeEmptyDOMElement();
  });
});
