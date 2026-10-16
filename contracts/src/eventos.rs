//! Eventos (interfaces/contract.md §4). Topics = [nombre, obra, hito?]; datos en un mapa con los
//! nombres de campo. La adenda llega en la Fase 4.

use soroban_sdk::{contractevent, Address, BytesN, String};

use crate::tipos::{Decision, EstadoHito};

#[contractevent(topics = ["creada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObraCreada {
    #[topic]
    pub obra: u32,
    pub nombre: String,
    pub municipio: Address,
    pub contratista: Address,
    pub inspector: Address,
    pub veedor: Address,
    pub arbitro: Address,
    pub token: Address,
    pub monto_original: i128,
    pub cantidad_hitos: u32,
    pub periodo_objecion: u64,
}

#[contractevent(topics = ["fondeada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObraFondeada {
    #[topic]
    pub obra: u32,
    pub monto: i128,
    pub fondeado: i128, // acumulado
}

#[contractevent(topics = ["declarado"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HitoDeclarado {
    #[topic]
    pub obra: u32,
    #[topic]
    pub hito: u32,
    pub evidencia_hash: BytesN<32>,
    pub fin_periodo: u64,
}

#[contractevent(topics = ["aprobado"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HitoAprobado {
    #[topic]
    pub obra: u32,
    #[topic]
    pub hito: u32,
    pub firmante: Address,
    pub completo: bool, // quedaron las dos aprobaciones
}

#[contractevent(topics = ["objetado"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HitoObjetado {
    #[topic]
    pub obra: u32,
    #[topic]
    pub hito: u32,
    pub motivo_hash: BytesN<32>,
}

#[contractevent(topics = ["resuelta"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObjecionResuelta {
    #[topic]
    pub obra: u32,
    #[topic]
    pub hito: u32,
    pub decision: Decision,
    pub estado: EstadoHito, // estado resultante
}

#[contractevent(topics = ["pagado"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PagoLiberado {
    #[topic]
    pub obra: u32,
    #[topic]
    pub hito: u32,
    pub contratista: Address,
    pub monto: i128,
    pub pagado: i128, // acumulado
}
