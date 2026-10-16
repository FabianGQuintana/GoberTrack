//! §5: TTL de obra, hitos e instancia tras cada escritura.

use soroban_sdk::testutils::{
    storage::{Instance as _, Persistent as _},
    Ledger as _,
};

use super::comun::*;
use crate::{Clave, EXTEND_TO, THRESHOLD};

pub(super) fn ttl_obra(c: &Ctx, obra: u32) -> u32 {
    c.env.as_contract(&c.id, || {
        c.env.storage().persistent().get_ttl(&Clave::Obra(obra))
    })
}

pub(super) fn ttl_hito(c: &Ctx, obra: u32, hito: u32) -> u32 {
    c.env.as_contract(&c.id, || {
        c.env
            .storage()
            .persistent()
            .get_ttl(&Clave::Hito(obra, hito))
    })
}

pub(super) fn ttl_instancia(c: &Ctx) -> u32 {
    c.env
        .as_contract(&c.id, || c.env.storage().instance().get_ttl())
}

/// Avanza el ledger lo suficiente para que el TTL restante quede por debajo del umbral.
pub(super) fn envejecer(c: &Ctx) {
    let seq = c.env.ledger().sequence();
    c.env
        .ledger()
        .set_sequence_number(seq + EXTEND_TO - THRESHOLD + 1);
}

#[test]
fn crear_obra_extiende_obra_hitos_e_instancia() {
    let c = ctx();
    let id = c.crear();
    assert_eq!(ttl_obra(&c, id), EXTEND_TO);
    for i in 0..4 {
        assert_eq!(ttl_hito(&c, id, i), EXTEND_TO, "hito {}", i);
    }
    assert_eq!(ttl_instancia(&c), EXTEND_TO);
}

#[test]
fn fondear_extiende_obra_e_instancia() {
    let c = ctx();
    let id = c.crear();
    envejecer(&c);
    assert!(ttl_obra(&c, id) < THRESHOLD);
    assert!(ttl_instancia(&c) < THRESHOLD);
    c.fondear(id, 100);
    assert_eq!(ttl_obra(&c, id), EXTEND_TO);
    assert_eq!(ttl_instancia(&c), EXTEND_TO);
}

#[test]
fn declarar_extiende_obra_hito_e_instancia() {
    let c = ctx();
    let id = c.crear();
    envejecer(&c);
    assert!(ttl_hito(&c, id, 0) < THRESHOLD);
    c.declarar(id, 0);
    assert_eq!(ttl_hito(&c, id, 0), EXTEND_TO);
    assert_eq!(ttl_obra(&c, id), EXTEND_TO);
    assert_eq!(ttl_instancia(&c), EXTEND_TO);
}

#[test]
fn aprobar_extiende_obra_hito_e_instancia() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    envejecer(&c);
    c.aprobar_inspector(id, 0);
    assert_eq!(ttl_hito(&c, id, 0), EXTEND_TO);
    assert_eq!(ttl_obra(&c, id), EXTEND_TO);
    assert_eq!(ttl_instancia(&c), EXTEND_TO);
}

#[test]
fn liberar_pago_extiende_obra_hito_e_instancia() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    envejecer(&c);
    c.client.liberar_pago(&id, &0);
    assert_eq!(ttl_hito(&c, id, 0), EXTEND_TO);
    assert_eq!(ttl_obra(&c, id), EXTEND_TO);
    assert_eq!(ttl_instancia(&c), EXTEND_TO);
}
