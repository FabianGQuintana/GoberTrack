//! Orden de validación de §3 cuando aplican dos errores, y estado `Objetado` forzado en el
//! almacenamiento (`objetar` y `resolver_objecion` llegan en la Fase 2).

use soroban_sdk::{testutils::Address as _, Address};

use super::comun::*;
use crate::{Error, EstadoHito};

#[test]
fn aprobar_sin_rol_sobre_hito_pendiente_es_no_autorizado_y_no_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    let otro = Address::generate(&c.env);
    assert_err!(c.client.try_aprobar(&id, &0, &otro), Error::NoAutorizado);
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.contratista),
        Error::NoAutorizado
    );
}

#[test]
fn aprobar_hito_anterior_pendiente_va_antes_que_ya_pagado() {
    // §3.4: paso 4 (anterior) antes que paso 5 (estado). Hito 1 Pagado con el 0 Pendiente.
    let c = ctx();
    let id = c.crear();
    c.forzar_estado(id, 1, EstadoHito::Pagado);
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.inspector),
        Error::HitoAnteriorPendiente
    );
}

#[test]
fn aprobar_hito_anterior_pendiente_va_antes_que_objecion_abierta_y_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    // Hito 1 Pendiente con el 0 Pendiente: HitoAnteriorPendiente, no EstadoInvalido.
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.inspector),
        Error::HitoAnteriorPendiente
    );
    // Hito 1 Objetado con el 0 Pendiente.
    c.forzar_estado(id, 1, EstadoHito::Objetado);
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.inspector),
        Error::HitoAnteriorPendiente
    );
}

#[test]
fn liberar_pago_ya_pagado_va_antes_que_hito_anterior_pendiente() {
    let c = ctx();
    let id = c.crear();
    c.forzar_estado(id, 1, EstadoHito::Pagado); // el hito 0 sigue Pendiente
    assert_err!(c.client.try_liberar_pago(&id, &1), Error::YaPagado);
}

#[test]
fn liberar_pago_objetado_va_antes_que_hito_anterior_pendiente() {
    let c = ctx();
    let id = c.crear();
    c.forzar_estado(id, 1, EstadoHito::Objetado); // el hito 0 sigue Pendiente
    assert_err!(c.client.try_liberar_pago(&id, &1), Error::ObjecionAbierta);
}

#[test]
fn liberar_pago_hito_anterior_pendiente_va_antes_que_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    // Hito 1 Pendiente con el 0 Pendiente.
    assert_err!(
        c.client.try_liberar_pago(&id, &1),
        Error::HitoAnteriorPendiente
    );
    // Hito 0 Pendiente: sin anterior, el error es EstadoInvalido.
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::EstadoInvalido);
}

#[test]
fn liberar_pago_estado_invalido_va_antes_que_periodo_no_cumplido_y_fondos() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0); // Evidencia, período vigente, sin fondos
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::EstadoInvalido);
}

#[test]
fn liberar_pago_periodo_no_cumplido_va_antes_que_fondos_insuficientes() {
    let c = ctx();
    let id = c.crear(); // sin fondear
    c.declarar_y_aprobar(id, 0);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::PeriodoNoCumplido);
    c.avanzar(PERIODO);
    assert_err!(
        c.client.try_liberar_pago(&id, &0),
        Error::FondosInsuficientes
    );
}

#[test]
fn declarar_hito_anterior_pendiente_va_antes_que_estado_invalido() {
    // Hito 1 ya declarado (forzado) con el 0 Pendiente.
    let c = ctx();
    let id = c.crear();
    c.forzar_estado(id, 1, EstadoHito::Evidencia);
    assert_err!(
        c.client.try_declarar_hito(&id, &1, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
}

#[test]
fn declarar_hito_no_existe_va_antes_que_hito_anterior_pendiente() {
    let c = ctx();
    let id = c.crear();
    assert_err!(
        c.client.try_declarar_hito(&id, &9, &hash(&c.env, 1)),
        Error::HitoNoExiste
    );
}

#[test]
fn con_hito_objetado_aprobar_y_liberar_son_objecion_abierta() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    // Se fuerza el estado que dejaría `objetar` (Fase 2).
    c.forzar_hito(id, 0, |h| {
        h.estado = EstadoHito::Objetado;
        h.objecion_usada = true;
        h.motivo_objecion_hash = Some(hash(&c.env, 9));
    });
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.veedor),
        Error::ObjecionAbierta
    );
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.inspector),
        Error::ObjecionAbierta
    );
    c.avanzar(PERIODO * 2);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::ObjecionAbierta);
    // Un Objetado tampoco se puede volver a declarar.
    assert_err!(
        c.client.try_declarar_hito(&id, &0, &hash(&c.env, 2)),
        Error::EstadoInvalido
    );
    assert_eq!(c.tok.balance(&c.contratista), 0);
}

#[test]
fn objetado_con_hito_anterior_ok_en_el_hito_siguiente() {
    // El hito 1 Objetado con el 0 Aprobado: aprobar y pagar dan ObjecionAbierta.
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.declarar(id, 1);
    c.forzar_estado(id, 1, EstadoHito::Objetado);
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.inspector),
        Error::ObjecionAbierta
    );
    c.avanzar(PERIODO);
    assert_err!(c.client.try_liberar_pago(&id, &1), Error::ObjecionAbierta);
}
