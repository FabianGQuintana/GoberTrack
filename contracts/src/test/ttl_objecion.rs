//! §5, Fase 2: TTL tras `objetar` y `resolver_objecion`.

use super::comun::*;
use super::ttl::{envejecer, ttl_hito, ttl_instancia, ttl_obra};
use crate::{Decision, EXTEND_TO, THRESHOLD};

fn ttls_ok(c: &Ctx, id: u32, hito: u32) {
    assert_eq!(ttl_hito(c, id, hito), EXTEND_TO);
    assert_eq!(ttl_obra(c, id), EXTEND_TO);
    assert_eq!(ttl_instancia(c), EXTEND_TO);
}

#[test]
fn objetar_extiende_obra_hito_e_instancia() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    envejecer(&c);
    assert!(ttl_hito(&c, id, 0) < THRESHOLD);
    assert!(ttl_obra(&c, id) < THRESHOLD);
    assert!(ttl_instancia(&c) < THRESHOLD);
    c.objetar(id, 0);
    ttls_ok(&c, id, 0);
}

#[test]
fn resolver_aceptar_extiende_obra_hito_e_instancia() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    envejecer(&c);
    assert!(ttl_hito(&c, id, 0) < THRESHOLD);
    assert!(ttl_obra(&c, id) < THRESHOLD);
    assert!(ttl_instancia(&c) < THRESHOLD);
    c.resolver(id, 0, Decision::Aceptar);
    ttls_ok(&c, id, 0);
}

#[test]
fn resolver_rechazar_extiende_obra_hito_e_instancia() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    envejecer(&c);
    assert!(ttl_hito(&c, id, 0) < THRESHOLD);
    assert!(ttl_obra(&c, id) < THRESHOLD);
    assert!(ttl_instancia(&c) < THRESHOLD);
    c.resolver(id, 0, Decision::Rechazar);
    ttls_ok(&c, id, 0);
}
