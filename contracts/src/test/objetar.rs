//! §3.5 `objetar`, siempre por flujo real salvo donde se indica.

use super::comun::*;
use crate::{Decision, Error, EstadoHito};

#[test]
fn el_veedor_objeta_en_evidencia_y_el_hito_queda_congelado() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.avanzar(10);
    c.client.objetar(&id, &0, &hash(&c.env, 7));
    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Objetado);
    assert!(h.objecion_usada);
    assert_eq!(h.motivo_objecion_hash, Some(hash(&c.env, 7)));
    assert!(!h.aprobo_veedor);
    assert_eq!(h.momento_declaracion, Some(T0));
}

#[test]
fn objetar_con_el_inspector_ya_aprobado_conserva_su_aprobacion() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    c.objetar(id, 0);
    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Objetado);
    assert!(h.aprobo_inspector);
}

#[test]
fn objetar_no_requiere_fondos() {
    let c = ctx();
    let id = c.crear(); // sin fondear
    c.declarar(id, 0);
    c.objetar(id, 0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Objetado);
}

#[test]
fn borde_de_la_ventana_en_fin_menos_1_se_puede_y_en_fin_se_rechaza() {
    let c = ctx();
    let fin = T0 + PERIODO;
    // Dos obras idénticas, declaradas en T0.
    let a = c.crear();
    let b = c.crear();
    c.declarar(a, 0);
    c.declarar(b, 0);

    c.ir_a(fin - 1);
    c.objetar(a, 0);
    assert_eq!(c.hito(a, 0).estado, EstadoHito::Objetado);

    c.ir_a(fin);
    assert_err!(
        c.client.try_objetar(&b, &0, &hash(&c.env, 9)),
        Error::FueraDePeriodo
    );
    assert_eq!(c.hito(b, 0).estado, EstadoHito::Evidencia);
    assert!(!c.hito(b, 0).objecion_usada);
}

#[test]
fn objetar_mucho_despues_del_periodo_es_fuera_de_periodo() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    c.avanzar(PERIODO * 10);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::FueraDePeriodo
    );
}

#[test]
fn con_periodo_cero_no_hay_ventana_para_objetar() {
    let c = ctx();
    let id = c.crear_con(&MONTOS, 0);
    c.declarar(id, 0);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::FueraDePeriodo
    );
}

#[test]
fn el_periodo_cuenta_desde_la_declaracion_no_desde_la_aprobacion_del_inspector() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.avanzar(PERIODO - 100);
    c.aprobar_inspector(id, 0);
    c.avanzar(100); // ahora == fin
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::FueraDePeriodo
    );
}

#[test]
fn objetado_es_objecion_abierta_en_pagar_aprobar_y_objetar_otra_vez() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    c.objetar(id, 0);
    c.avanzar(PERIODO * 2); // aunque el período ya pasó, el pago sigue congelado

    assert_err!(c.client.try_liberar_pago(&id, &0), Error::ObjecionAbierta);
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.veedor),
        Error::ObjecionAbierta
    );
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.inspector),
        Error::ObjecionAbierta
    );
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::ObjecionAbierta
    );
    // Tampoco se puede re-declarar un hito objetado.
    assert_err!(
        c.client.try_declarar_hito(&id, &0, &hash(&c.env, 2)),
        Error::EstadoInvalido
    );
    assert_eq!(c.tok.balance(&c.contratista), 0);
    assert_eq!(c.client.ver_obra(&id).pagado, 0);
}

#[test]
fn veedor_aprobo_y_luego_objeta_es_ya_decidio_en_evidencia() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_veedor(id, 0); // solo aprobó el veedor: sigue en Evidencia
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Evidencia);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::YaDecidio
    );
}

#[test]
fn veedor_aprobo_y_luego_objeta_es_ya_decidio_en_aprobado() {
    let c = ctx();
    let id = c.crear();
    c.declarar_y_aprobar(id, 0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Aprobado);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::YaDecidio
    );
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Aprobado);
}

#[test]
fn objetar_un_hito_pendiente_es_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::EstadoInvalido
    );
}

#[test]
fn objetar_un_hito_pagado_es_ya_pagado() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &0);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::YaPagado
    );
}

#[test]
fn objetar_un_hito_pendiente_tras_aceptar_es_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Aceptar);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::EstadoInvalido
    );
}

#[test]
fn objetar_tras_rechazar_es_objecion_ya_usada_y_no_ya_decidio() {
    // Tras un Rechazar `aprobo_veedor` es true y `objecion_usada` también: §3.5 evalúa
    // ObjecionYaUsada (paso 4) antes que YaDecidio (paso 5).
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Rechazar);
    let h = c.hito(id, 0);
    assert!(h.aprobo_veedor && h.objecion_usada);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::ObjecionYaUsada
    );
}

#[test]
fn objecion_ya_usada_va_antes_que_fuera_de_periodo() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Rechazar);
    c.avanzar(PERIODO * 5);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::ObjecionYaUsada
    );
}

#[test]
fn ya_decidio_va_antes_que_fuera_de_periodo() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_veedor(id, 0);
    c.avanzar(PERIODO * 5);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::YaDecidio
    );
}

#[test]
fn estado_va_antes_que_objecion_ya_usada() {
    // Hito Pendiente (tras Aceptar) con `objecion_usada` forzada en true: EstadoInvalido.
    let c = ctx();
    let id = c.crear();
    c.forzar_hito(id, 0, |h| h.objecion_usada = true);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::EstadoInvalido
    );
    // Pagado con `objecion_usada` (tras un Rechazar real): YaPagado.
    let id2 = c.crear();
    c.fondear(id2, TOTAL);
    c.declarar(id2, 0);
    c.objetar(id2, 0);
    c.resolver(id2, 0, Decision::Rechazar);
    c.aprobar_inspector(id2, 0);
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id2, &0);
    assert!(c.hito(id2, 0).objecion_usada);
    assert_err!(
        c.client.try_objetar(&id2, &0, &hash(&c.env, 9)),
        Error::YaPagado
    );
    // Objetado con `objecion_usada` en true (siempre lo está): ObjecionAbierta.
    let id3 = c.crear();
    c.declarar(id3, 0);
    c.objetar(id3, 0);
    assert_err!(
        c.client.try_objetar(&id3, &0, &hash(&c.env, 9)),
        Error::ObjecionAbierta
    );
}

#[test]
fn objecion_abierta_en_un_hito_no_afecta_a_otra_obra() {
    let c = ctx();
    let a = c.crear();
    let b = c.crear();
    c.declarar(a, 0);
    c.declarar(b, 0);
    c.objetar(a, 0);
    assert_eq!(c.hito(b, 0).estado, EstadoHito::Evidencia);
    c.objetar(b, 0);
    assert_eq!(c.hito(b, 0).estado, EstadoHito::Objetado);
}

#[test]
fn obra_y_hito_inexistentes() {
    let c = ctx();
    let id = c.crear();
    let h = hash(&c.env, 9);
    assert_err!(c.client.try_objetar(&0, &0, &h), Error::ObraNoExiste);
    assert_err!(c.client.try_objetar(&99, &0, &h), Error::ObraNoExiste);
    assert_err!(c.client.try_objetar(&id, &4, &h), Error::HitoNoExiste);
    assert_err!(
        c.client.try_objetar(&id, &u32::MAX, &h),
        Error::HitoNoExiste
    );
}
