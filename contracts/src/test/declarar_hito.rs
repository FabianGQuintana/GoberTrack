//! §3.3 `declarar_hito`.

use super::comun::*;
use crate::{Error, EstadoHito};

#[test]
fn declarar_el_primer_hito() {
    let c = ctx();
    let id = c.crear();
    c.client.declarar_hito(&id, &0, &hash(&c.env, 7));
    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Evidencia);
    assert_eq!(h.evidencia_hash, Some(hash(&c.env, 7)));
    assert_eq!(h.momento_declaracion, Some(T0));
    assert!(!h.aprobo_inspector && !h.aprobo_veedor);
    assert!(!h.veedor_por_arbitro && !h.objecion_usada);
    assert_eq!(h.motivo_objecion_hash, None);
    assert_eq!(h.momento_aprobacion_completa, None);
    // Los demás hitos no cambian.
    assert_eq!(c.hito(id, 1).estado, EstadoHito::Pendiente);
}

#[test]
fn declarar_no_requiere_fondos() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0); // sin fondear
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Evidencia);
}

#[test]
fn declarar_dos_veces_es_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    assert_err!(
        c.client.try_declarar_hito(&id, &0, &hash(&c.env, 2)),
        Error::EstadoInvalido
    );
    // Tampoco una vez aprobado.
    c.aprobar_inspector(id, 0);
    c.aprobar_veedor(id, 0);
    assert_err!(
        c.client.try_declarar_hito(&id, &0, &hash(&c.env, 2)),
        Error::EstadoInvalido
    );
}

#[test]
fn declarar_un_hito_pagado_es_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &0);
    assert_err!(
        c.client.try_declarar_hito(&id, &0, &hash(&c.env, 2)),
        Error::EstadoInvalido
    );
}

#[test]
fn saltear_un_hito_es_hito_anterior_pendiente() {
    let c = ctx();
    let id = c.crear();
    assert_err!(
        c.client.try_declarar_hito(&id, &1, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
    assert_err!(
        c.client.try_declarar_hito(&id, &3, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
    // Con el anterior solo en Evidencia (sin aprobar) todavía no alcanza.
    c.declarar(id, 0);
    assert_err!(
        c.client.try_declarar_hito(&id, &1, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
    // Con una sola aprobación, tampoco.
    c.aprobar_inspector(id, 0);
    assert_err!(
        c.client.try_declarar_hito(&id, &1, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
}

#[test]
fn con_el_anterior_aprobado_o_pagado_se_puede_declarar() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    // Aprobado (sin pagar) alcanza.
    c.declarar(id, 1);
    assert_eq!(c.hito(id, 1).estado, EstadoHito::Evidencia);
    // Pagado también.
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &0);
    c.aprobar_inspector(id, 1);
    c.aprobar_veedor(id, 1);
    c.declarar(id, 2);
    assert_eq!(c.hito(id, 2).estado, EstadoHito::Evidencia);
}

#[test]
fn declarar_registra_el_momento_actual() {
    let c = ctx();
    let id = c.crear();
    c.avanzar(555);
    c.declarar(id, 0);
    assert_eq!(c.hito(id, 0).momento_declaracion, Some(T0 + 555));
}

#[test]
fn obra_y_hito_inexistentes() {
    let c = ctx();
    let id = c.crear();
    assert_err!(
        c.client.try_declarar_hito(&0, &0, &hash(&c.env, 1)),
        Error::ObraNoExiste
    );
    assert_err!(
        c.client.try_declarar_hito(&99, &0, &hash(&c.env, 1)),
        Error::ObraNoExiste
    );
    assert_err!(
        c.client.try_declarar_hito(&id, &4, &hash(&c.env, 1)),
        Error::HitoNoExiste
    );
    assert_err!(
        c.client.try_declarar_hito(&id, &u32::MAX, &hash(&c.env, 1)),
        Error::HitoNoExiste
    );
}
