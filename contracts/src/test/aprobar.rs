//! §3.4 `aprobar`.

use soroban_sdk::{testutils::Address as _, Address};

use super::comun::*;
use crate::{Error, EstadoHito};

#[test]
fn una_aprobacion_deja_el_hito_en_evidencia_y_dos_lo_aprueban() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);

    c.aprobar_inspector(id, 0);
    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Evidencia);
    assert!(h.aprobo_inspector && !h.aprobo_veedor);
    assert_eq!(h.momento_aprobacion_completa, None);

    c.avanzar(30);
    c.aprobar_veedor(id, 0);
    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Aprobado);
    assert!(h.aprobo_inspector && h.aprobo_veedor);
    assert!(!h.veedor_por_arbitro);
    assert_eq!(h.momento_aprobacion_completa, Some(T0 + 30));
}

#[test]
fn el_orden_de_las_aprobaciones_no_importa() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_veedor(id, 0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Evidencia);
    c.aprobar_inspector(id, 0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Aprobado);
}

#[test]
fn aprobar_dos_veces_con_la_misma_direccion_es_ya_decidio() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);

    c.aprobar_inspector(id, 0);
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.inspector),
        Error::YaDecidio
    );
    c.aprobar_veedor(id, 0);
    // Ya Aprobado: los dos siguen recibiendo YaDecidio.
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.inspector),
        Error::YaDecidio
    );
    assert_err!(c.client.try_aprobar(&id, &0, &c.veedor), Error::YaDecidio);
}

#[test]
fn veedor_dos_veces_en_evidencia_es_ya_decidio() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_veedor(id, 0);
    assert_err!(c.client.try_aprobar(&id, &0, &c.veedor), Error::YaDecidio);
}

#[test]
fn firmante_sin_rol_es_no_autorizado_incluidos_municipio_contratista_y_arbitro() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    let otro = Address::generate(&c.env);
    for firmante in [&c.municipio, &c.contratista, &c.arbitro, &otro] {
        assert_err!(c.client.try_aprobar(&id, &0, firmante), Error::NoAutorizado);
    }
    // Nada cambió.
    let h = c.hito(id, 0);
    assert!(!h.aprobo_inspector && !h.aprobo_veedor);
    assert_eq!(h.estado, EstadoHito::Evidencia);
}

#[test]
fn aprobar_un_hito_pendiente_es_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.inspector),
        Error::EstadoInvalido
    );
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.veedor),
        Error::EstadoInvalido
    );
}

#[test]
fn aprobar_un_hito_pagado_es_ya_pagado() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &0);
    // Las banderas de aprobación siguen en true, pero YaPagado va antes que YaDecidio.
    assert_err!(c.client.try_aprobar(&id, &0, &c.inspector), Error::YaPagado);
    assert_err!(c.client.try_aprobar(&id, &0, &c.veedor), Error::YaPagado);
}

#[test]
fn saltear_un_hito_al_aprobar_es_hito_anterior_pendiente() {
    let c = ctx();
    let id = c.crear();
    // El hito 1 no se puede declarar con el 0 pendiente: se fuerza a Evidencia en el
    // almacenamiento para llegar a la validación de `aprobar`.
    c.forzar_estado(id, 1, EstadoHito::Evidencia);
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.inspector),
        Error::HitoAnteriorPendiente
    );
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.veedor),
        Error::HitoAnteriorPendiente
    );

    // Con el 0 en Evidencia o con una sola aprobación sigue igual.
    c.declarar(id, 0);
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.inspector),
        Error::HitoAnteriorPendiente
    );
    c.aprobar_inspector(id, 0);
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.inspector),
        Error::HitoAnteriorPendiente
    );

    // Con el 0 Aprobado se puede.
    c.aprobar_veedor(id, 0);
    c.aprobar_inspector(id, 1);
    assert!(c.hito(id, 1).aprobo_inspector);
}

#[test]
fn objetado_es_objecion_abierta() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.forzar_hito(id, 0, |h| {
        h.estado = EstadoHito::Objetado;
        h.objecion_usada = true;
        h.motivo_objecion_hash = Some(hash(&c.env, 9));
    });
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.inspector),
        Error::ObjecionAbierta
    );
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.veedor),
        Error::ObjecionAbierta
    );
}

#[test]
fn aprobar_sin_limite_de_tiempo_despues_del_periodo() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.avanzar(PERIODO * 100);
    c.aprobar_inspector(id, 0);
    c.aprobar_veedor(id, 0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Aprobado);
}

#[test]
fn aprobar_no_requiere_fondos() {
    let c = ctx();
    let id = c.crear();
    c.declarar_y_aprobar(id, 0); // sin fondear
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Aprobado);
}

#[test]
fn obra_y_hito_inexistentes() {
    let c = ctx();
    let id = c.crear();
    assert_err!(
        c.client.try_aprobar(&0, &0, &c.inspector),
        Error::ObraNoExiste
    );
    assert_err!(
        c.client.try_aprobar(&7, &0, &c.inspector),
        Error::ObraNoExiste
    );
    assert_err!(
        c.client.try_aprobar(&id, &4, &c.inspector),
        Error::HitoNoExiste
    );
    // HitoNoExiste va antes que NoAutorizado.
    assert_err!(
        c.client.try_aprobar(&id, &4, &c.contratista),
        Error::HitoNoExiste
    );
    assert_err!(
        c.client.try_aprobar(&7, &0, &c.contratista),
        Error::ObraNoExiste
    );
}
