import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TarjetaHito } from "@/components/TarjetaHito";
import type { Evento, Hito } from "@/lib/api/tipos";
import { AHORA, declaradoHace, hito, iso, obra } from "../helpers/fixtures";

const H = "a".repeat(64);
const OTRO = "c".repeat(64);

let contador = 0;
function declaracion(indice: number, hash: string, haceMs: number): Evento {
  contador += 1;
  return {
    id: String(1000 + contador),
    tipo: "HitoDeclarado",
    obra_id: 1,
    hito: indice,
    ledger: 100 + contador,
    momento: iso(AHORA - haceMs),
    tx_hash: String(contador).padStart(64, "0"),
    datos: { evidencia_hash: hash, fin_periodo: iso(AHORA - haceMs + 60_000) },
  };
}

function renderizar(h: Hito, eventos: Evento[], hitos: Hito[] = [h]) {
  render(
    <ul>
      <TarjetaHito hito={h} obra={obra()} hitos={hitos} eventos={eventos} />
    </ul>,
  );
}

const vigente = (hash: string) => hito(0, "Evidencia", { ...declaradoHace(30_000), evidencia_hash: hash });
/** Lista de "Declaraciones anteriores" (dentro de su <details>), o null. */
const anteriores = () =>
  (screen.queryByText(/^Declaraciones anteriores/, { selector: "summary" })?.closest("details")?.querySelector("ul") ?? null) as HTMLElement | null;
const MARCA_VIGENTE = "Misma evidencia que la declaración anterior.";

describe("TarjetaHito: re-declaración con la misma evidencia (F2)", () => {
  it("declara H, se acepta la objeción y declara H otra vez: la anterior aparece en 'Declaraciones anteriores' y la vigente lleva la marca", () => {
    renderizar(vigente(H), [declaracion(0, H, 900_000), declaracion(0, H, 30_000)]);

    const lista = anteriores();
    expect(lista).not.toBeNull();
    expect(within(lista!).getAllByRole("listitem")).toHaveLength(1);
    expect(within(lista!).getByRole("link", { name: /Abrir la evidencia de esa declaración/ })).toBeInTheDocument();
    expect(screen.getByText(MARCA_VIGENTE)).toBeInTheDocument();
  });

  it("con tres declaraciones iguales, la segunda (anterior) también lleva la marca y la primera no", () => {
    renderizar(vigente(H), [declaracion(0, H, 900_000), declaracion(0, H, 600_000), declaracion(0, H, 30_000)]);
    const items = within(anteriores()!).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).not.toHaveTextContent("misma evidencia que la declaración anterior");
    expect(items[1]).toHaveTextContent("(misma evidencia que la declaración anterior)");
    expect(screen.getByText(MARCA_VIGENTE)).toBeInTheDocument();
  });

  it("con hashes distintos no hay ninguna marca", () => {
    renderizar(vigente(OTRO), [declaracion(0, H, 900_000), declaracion(0, OTRO, 30_000)]);
    const items = within(anteriores()!).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveTextContent(/misma evidencia/i);
    expect(screen.queryByText(MARCA_VIGENTE)).not.toBeInTheDocument();
  });

  it("hashes A, B, B: solo la repetición B→B se marca (en la vigente)", () => {
    renderizar(vigente(OTRO), [declaracion(0, H, 900_000), declaracion(0, OTRO, 600_000), declaracion(0, OTRO, 30_000)]);
    const items = within(anteriores()!).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).not.toHaveTextContent(/misma evidencia/i);
    expect(items[1]).not.toHaveTextContent(/misma evidencia/i); // B no repite a A
    expect(screen.getByText(MARCA_VIGENTE)).toBeInTheDocument(); // B repite a B
  });

  it("una sola declaración: sin 'Declaraciones anteriores' ni marca", () => {
    renderizar(vigente(H), [declaracion(0, H, 30_000)]);
    expect(anteriores()).toBeNull();
    expect(screen.queryByText(MARCA_VIGENTE)).not.toBeInTheDocument();
  });

  it("ignora declaraciones de otros hitos", () => {
    renderizar(vigente(H), [declaracion(1, H, 900_000), declaracion(0, H, 30_000)]);
    expect(anteriores()).toBeNull();
    expect(screen.queryByText(MARCA_VIGENTE)).not.toBeInTheDocument();
  });

  it("hito Pendiente tras aceptar la objeción: las declaraciones previas quedan como anteriores y no hay vigente", () => {
    renderizar(hito(0, "Pendiente"), [declaracion(0, H, 900_000)]);
    expect(within(anteriores()!).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Todavía sin evidencia")).toBeInTheDocument();
  });
});

describe("TarjetaHito: aprobaciones y orden", () => {
  it("muestra quién aprobó con el momento del evento", () => {
    const h = hito(0, "Evidencia", { ...declaradoHace(30_000), aprobo_inspector: true });
    const aprobado: Evento = {
      id: "2000",
      tipo: "HitoAprobado",
      obra_id: 1,
      hito: 0,
      ledger: 200,
      momento: iso(AHORA - 10_000),
      tx_hash: "e".repeat(64),
      datos: { firmante: obra().inspector, completo: false },
    };
    renderizar(h, [declaracion(0, h.evidencia_hash!, 30_000), aprobado]);
    expect(screen.getByText(/^Inspector aprobó · \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByText("Veedor: sin decidir")).toBeInTheDocument();
  });

  it("un hito Pendiente con el anterior sin aprobar queda bloqueado", () => {
    const h = hito(1, "Pendiente");
    renderizar(h, [], [hito(0, "Evidencia", declaradoHace(30_000)), h]);
    expect(screen.getByText("Bloqueado: espera que se apruebe el hito 1")).toBeInTheDocument();
  });
});
