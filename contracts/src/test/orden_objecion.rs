//! Orden de validación de `objetar` (§3.5) y `resolver_objecion` (§3.6), Fase 2.

use super::comun::*;
use crate::{Decision, Error, EstadoHito};

#[test]
fn objetar_ya_pagado_se_evalua_antes_que_ya_decidio() {
    // Un hito Pagado tiene `aprobo_veedor`; igual el error es YaPagado (paso 3 antes que 5).
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &0);
    assert!(c.hito(id, 0).aprobo_veedor);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::YaPagado
    );
}

#[test]
fn objetar_no_valida_el_hito_anterior() {
    // §3.5 no tiene el paso "hito anterior OK": un hito 1 en Evidencia se puede objetar aunque
    // el 0 esté Pendiente (estado alcanzable solo por almacenamiento).
    let c = ctx();
    let id = c.crear();
    c.forzar_hito(id, 1, |h| {
        h.estado = EstadoHito::Evidencia;
        h.momento_declaracion = Some(T0);
    });
    c.objetar(id, 1);
    assert_eq!(c.hito(id, 1).estado, EstadoHito::Objetado);
}

#[test]
fn resolver_un_hito_pendiente_con_anterior_pendiente_es_estado_invalido() {
    // §3.6 tampoco valida el anterior.
    let c = ctx();
    let id = c.crear();
    assert_err!(
        c.client.try_resolver_objecion(&id, &1, &Decision::Aceptar),
        Error::EstadoInvalido
    );
}

#[test]
fn flujo_real_objetado_liberar_y_aprobar_son_objecion_abierta() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    c.objetar(id, 0);
    c.avanzar(PERIODO * 2);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::ObjecionAbierta);
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.veedor),
        Error::ObjecionAbierta
    );
}
