//! Tipos y errores del contrato (interfaces/contract.md §1 y §2).

use soroban_sdk::{contracterror, contracttype, Address, BytesN, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NuevoHito {
    pub descripcion: String,
    pub monto: i128,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EstadoObra {
    Activa,
    Finalizada,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EstadoHito {
    Pendiente,
    Evidencia,
    Aprobado,
    Objetado,
    Pagado,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Decision {
    Aceptar,
    Rechazar,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Obra {
    pub id: u32,
    pub nombre: String,
    pub municipio: Address,
    pub contratista: Address,
    pub inspector: Address,
    pub veedor: Address,
    pub arbitro: Address,
    pub token: Address,
    pub monto_original: i128, // inmutable: suma de los montos originales de los hitos
    pub monto_vigente: i128,  // suma de los montos vigentes de los hitos
    pub fondeado: i128,       // acumulado depositado por el municipio
    pub pagado: i128,         // acumulado pagado al contratista
    pub periodo_objecion: u64, // segundos
    pub cantidad_hitos: u32,
    pub estado: EstadoObra,
    pub creada_en: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Hito {
    pub indice: u32,
    pub descripcion: String,
    pub monto_original: i128, // inmutable
    pub monto_vigente: i128,  // cambia solo con adendas (Fase 4)
    pub estado: EstadoHito,
    pub evidencia_hash: Option<BytesN<32>>, // de la declaración vigente
    pub momento_declaracion: Option<u64>,   // inicio del período de objeción
    pub aprobo_inspector: bool,
    pub aprobo_veedor: bool,
    pub veedor_por_arbitro: bool, // la aprobación del veedor vino de un Rechazar
    pub objecion_usada: bool,     // en la declaración vigente
    pub motivo_objecion_hash: Option<BytesN<32>>,
    pub momento_aprobacion_completa: Option<u64>,
    pub momento_pago: Option<u64>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ObraNoExiste = 1,
    HitoNoExiste = 2,
    NoAutorizado = 3, // `firmante` no es inspector ni veedor
    RolesDuplicados = 4,
    MontoInvalido = 5,         // monto ≤ 0, lista de hitos vacía o suma desbordada
    ExcedeMontoTotal = 6,      // fondeado + monto > monto_vigente
    FondosInsuficientes = 7,   // saldo < monto_vigente del hito
    EstadoInvalido = 8,        // la acción no corresponde al estado del hito
    HitoAnteriorPendiente = 9, // el hito anterior no está Aprobado ni Pagado
    YaDecidio = 10,            // el rol ya aprobó (o el veedor ya decidió) en esta declaración
    ObjecionAbierta = 11,      // el hito está Objetado
    ObjecionYaUsada = 12,      // el veedor ya objetó en esta declaración (y fue rechazada)
    FueraDePeriodo = 13,       // objeción con ahora >= fin del período
    PeriodoNoCumplido = 14,    // pago con ahora < fin del período
    YaPagado = 15,
}
