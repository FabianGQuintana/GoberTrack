// Alias legibles sobre los tipos generados desde interfaces/openapi.yaml (no editar esquema.ts a mano:
// se regenera con `npm run gen:api`, que corre antes de `dev` y `build`).
import type { components } from "./esquema";

type Esquemas = components["schemas"];

export type Monto = Esquemas["Monto"];
export type Direccion = Esquemas["Direccion"];
export type Hash = Esquemas["Hash"];
export type EstadoObra = Esquemas["EstadoObra"];
export type EstadoHito = Esquemas["EstadoHito"];
export type Obra = Esquemas["Obra"];
export type Hito = Esquemas["Hito"];
export type TipoEvento = Esquemas["TipoEvento"];
export type Evento = Esquemas["Evento"];
export type Alerta = Esquemas["Alerta"];
export type Evidencia = Esquemas["Evidencia"];
export type ErrorApi = Esquemas["Error"];
