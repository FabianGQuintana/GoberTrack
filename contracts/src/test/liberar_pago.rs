//! §3.7 `liberar_pago`.

use soroban_sdk::{testutils::Address as _, Address};

use super::comun::*;
use crate::{Error, EstadoHito, EstadoObra};

#[test]
fn cobrar_sin_las_dos_aprobaciones_es_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.avanzar(PERIODO * 2); // el período ya pasó: lo único que falta son las aprobaciones

    // Sin ninguna aprobación.
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::EstadoInvalido);
    // Solo el inspector.
    c.aprobar_inspector(id, 0);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::EstadoInvalido);
    // Solo el veedor: se arma en otra obra.
    let b = c.crear();
    c.fondear(b, TOTAL);
    c.declarar(b, 0);
    c.aprobar_veedor(b, 0);
    c.avanzar(PERIODO * 2);
    assert_err!(c.client.try_liberar_pago(&b, &0), Error::EstadoInvalido);

    assert_eq!(c.tok.balance(&c.contratista), 0);
}

#[test]
fn liberar_un_hito_pendiente_es_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::EstadoInvalido);
}

#[test]
fn pagar_dos_veces_es_ya_pagado() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &0);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::YaPagado);
    assert_eq!(c.tok.balance(&c.contratista), MONTOS[0]);
    assert_eq!(c.client.ver_obra(&id).pagado, MONTOS[0]);
}

#[test]
fn saltear_un_hito_al_pagar_es_hito_anterior_pendiente() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    // El 1 no se puede declarar con el 0 pendiente: se fuerza a Aprobado en el almacenamiento.
    c.forzar_estado(id, 1, EstadoHito::Aprobado);
    c.forzar_hito(id, 1, |h| h.momento_declaracion = Some(T0));
    c.avanzar(PERIODO * 2);

    // N = 0 Pendiente.
    assert_err!(
        c.client.try_liberar_pago(&id, &1),
        Error::HitoAnteriorPendiente
    );
    // N = 0 en Evidencia.
    c.declarar(id, 0);
    assert_err!(
        c.client.try_liberar_pago(&id, &1),
        Error::HitoAnteriorPendiente
    );
    assert_eq!(c.tok.balance(&c.contratista), 0);
}

#[test]
fn con_el_anterior_aprobado_sin_pagar_se_puede_pagar_el_siguiente() {
    // "Hito anterior OK" = Aprobado o Pagado (§3).
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.declarar_y_aprobar(id, 1);
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &1);
    assert_eq!(c.hito(id, 1).estado, EstadoHito::Pagado);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Aprobado);
    assert_eq!(c.client.ver_obra(&id).estado, EstadoObra::Activa);
}

#[test]
fn pagar_mas_de_lo_fondeado_es_fondos_insuficientes() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, MONTOS[0] - 1);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    assert_err!(
        c.client.try_liberar_pago(&id, &0),
        Error::FondosInsuficientes
    );
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Aprobado);
    assert_eq!(c.client.ver_obra(&id).pagado, 0);
    // Con 1 más (justo el monto) paga.
    c.fondear(id, 1);
    c.client.liberar_pago(&id, &0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Pagado);
}

#[test]
fn el_saldo_es_fondeado_menos_pagado() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, MONTOS[0]); // solo alcanza para el hito 0
    c.declarar_y_aprobar(id, 0);
    c.declarar_y_aprobar(id, 1);
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &0);
    // Saldo 0: el hito 1 (200) no se puede pagar.
    assert_err!(
        c.client.try_liberar_pago(&id, &1),
        Error::FondosInsuficientes
    );
    c.fondear(id, MONTOS[1] - 1);
    assert_err!(
        c.client.try_liberar_pago(&id, &1),
        Error::FondosInsuficientes
    );
    c.fondear(id, 1);
    c.client.liberar_pago(&id, &1);
    assert_eq!(c.tok.balance(&c.contratista), MONTOS[0] + MONTOS[1]);
}

#[test]
fn el_saldo_de_otra_obra_con_el_mismo_token_no_sirve() {
    let c = ctx();
    let a = c.crear();
    let b = c.crear();
    c.fondear(b, TOTAL); // el contrato tiene 1000 de este token
    c.fondear(a, MONTOS[0] - 50); // pero la obra A tiene 50 menos de lo que necesita
    c.declarar_y_aprobar(a, 0);
    c.avanzar(PERIODO);
    assert_eq!(c.tok.balance(&c.id), TOTAL + MONTOS[0] - 50);
    assert_err!(
        c.client.try_liberar_pago(&a, &0),
        Error::FondosInsuficientes
    );
    assert_eq!(c.tok.balance(&c.contratista), 0);
    // La obra B sigue intacta.
    assert_eq!(c.client.ver_obra(&b).pagado, 0);
    assert_eq!(c.client.ver_obra(&b).fondeado, TOTAL);
}

#[test]
fn pagar_antes_del_fin_del_periodo_falla_en_fin_menos_1_y_paga_en_fin() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0); // momento_declaracion = T0, fin = T0 + PERIODO
    c.aprobar_inspector(id, 0);
    c.aprobar_veedor(id, 0);
    let fin = T0 + PERIODO;

    assert_err!(c.client.try_liberar_pago(&id, &0), Error::PeriodoNoCumplido);
    c.ir_a(fin - 1);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::PeriodoNoCumplido);
    assert_eq!(c.tok.balance(&c.contratista), 0);
    c.ir_a(fin);
    c.client.liberar_pago(&id, &0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Pagado);
    assert_eq!(c.hito(id, 0).momento_pago, Some(fin));
}

#[test]
fn el_periodo_cuenta_desde_la_declaracion_no_desde_la_aprobacion() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.avanzar(PERIODO); // el período ya venció
    c.aprobar_inspector(id, 0);
    c.aprobar_veedor(id, 0); // aprobado recién ahora
    c.client.liberar_pago(&id, &0); // se paga en el acto
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Pagado);
}

#[test]
fn periodo_cero_permite_pagar_en_el_acto() {
    let c = ctx();
    let id = c.crear_con(&MONTOS, 0);
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.client.liberar_pago(&id, &0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Pagado);
}

#[test]
fn periodo_enorme_no_hace_panic_y_no_habilita_el_pago() {
    let c = ctx();
    let id = c.crear_con(&MONTOS, u64::MAX);
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(1_000_000);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::PeriodoNoCumplido);
}

#[test]
fn objetado_es_objecion_abierta() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    c.forzar_estado(id, 0, EstadoHito::Objetado);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::ObjecionAbierta);
    assert_eq!(c.tok.balance(&c.contratista), 0);
}

#[test]
fn cualquiera_puede_llamar_y_el_dinero_va_al_contratista() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    let curioso = Address::generate(&c.env);
    let antes = c.tok.balance(&curioso);
    c.client.liberar_pago(&id, &0);
    assert_eq!(c.tok.balance(&curioso), antes);
    assert_eq!(c.tok.balance(&c.contratista), MONTOS[0]);
}

#[test]
fn obra_y_hito_inexistentes() {
    let c = ctx();
    let id = c.crear();
    assert_err!(c.client.try_liberar_pago(&0, &0), Error::ObraNoExiste);
    assert_err!(c.client.try_liberar_pago(&5, &0), Error::ObraNoExiste);
    assert_err!(c.client.try_liberar_pago(&id, &4), Error::HitoNoExiste);
}
