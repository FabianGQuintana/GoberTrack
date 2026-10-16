//! Almacenamiento y TTL (interfaces/contract.md §5).
//!
//! Obras e hitos van en almacenamiento persistent (al vencer el TTL se archivan y se pueden
//! restaurar). El último id asignado va en instance. Temporary no se usa.

use soroban_sdk::{contracttype, Env};

use crate::tipos::{Error, Hito, Obra};

/// TTL al que se extiende cada entrada escrita: ≈ 30 días a 5 s por ledger.
/// Entra en el máximo de testnet (max_entry_ttl = 3 110 400 ledgers, ver DEPLOY.md).
pub const EXTEND_TO: u32 = 518_400;
/// Solo se extiende si al TTL le quedan menos de estos ledgers (la mitad de EXTEND_TO).
pub const THRESHOLD: u32 = 259_200;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Clave {
    UltimaObra,     // instance: u32, último id asignado
    Obra(u32),      // persistent: Obra
    Hito(u32, u32), // persistent: Hito (obra, índice)
}

/// Último id de obra asignado (0 si no hay obras).
pub fn ultima_obra(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&Clave::UltimaObra)
        .unwrap_or(0)
}

pub fn guardar_ultima_obra(env: &Env, id: u32) {
    env.storage().instance().set(&Clave::UltimaObra, &id);
}

/// Extiende el TTL de la instancia del contrato (y de su código).
pub fn extender_instancia(env: &Env) {
    env.storage().instance().extend_ttl(THRESHOLD, EXTEND_TO);
}

pub fn cargar_obra(env: &Env, obra: u32) -> Result<Obra, Error> {
    env.storage()
        .persistent()
        .get(&Clave::Obra(obra))
        .ok_or(Error::ObraNoExiste)
}

/// Guarda la obra y extiende su TTL.
pub fn guardar_obra(env: &Env, obra: &Obra) {
    let clave = Clave::Obra(obra.id);
    env.storage().persistent().set(&clave, obra);
    env.storage()
        .persistent()
        .extend_ttl(&clave, THRESHOLD, EXTEND_TO);
}

/// Extiende el TTL de una obra que la función toca pero no modifica.
pub fn extender_obra(env: &Env, obra: u32) {
    env.storage()
        .persistent()
        .extend_ttl(&Clave::Obra(obra), THRESHOLD, EXTEND_TO);
}

pub fn cargar_hito(env: &Env, obra: &Obra, hito: u32) -> Result<Hito, Error> {
    if hito >= obra.cantidad_hitos {
        return Err(Error::HitoNoExiste);
    }
    env.storage()
        .persistent()
        .get(&Clave::Hito(obra.id, hito))
        .ok_or(Error::HitoNoExiste)
}

/// Guarda el hito y extiende su TTL.
pub fn guardar_hito(env: &Env, obra: u32, hito: &Hito) {
    let clave = Clave::Hito(obra, hito.indice);
    env.storage().persistent().set(&clave, hito);
    env.storage()
        .persistent()
        .extend_ttl(&clave, THRESHOLD, EXTEND_TO);
}
