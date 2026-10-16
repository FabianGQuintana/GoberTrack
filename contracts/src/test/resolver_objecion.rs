//! §3.6 `resolver_objecion`, siempre por flujo real.

use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
    Address, IntoVal,
};

use super::comun::*;
use crate::{Decision, Error, EstadoHito};

#[test]
fn resolver_sin_ser_arbitro_falla_con_error_de_autorizacion_del_host() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    let con_firma = |firmante: &Address| {
        c.env.mock_auths(&[MockAuth {
            address: firmante,
            invoke: &MockAuthInvoke {
                contract: &c.id,
                fn_name: "resolver_objecion",
                args: (id, 0u32, Decision::Aceptar).into_val(&c.env),
                sub_invokes: &[],
            },
        }]);
        c.client.try_resolver_objecion(&id, &0, &Decision::Aceptar)
    };
    for otro in [&c.municipio, &c.veedor, &c.inspector, &c.contratista] {
        let r = con_firma(otro);
        assert!(matches!(r, Err(Err(_))), "{:?}", r);
    }
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Objetado);
    // Control: el árbitro sí puede.
    assert_eq!(con_firma(&c.arbitro), Ok(Ok(())));
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Pendiente);
}

#[test]
fn con_arbitro_igual_al_municipio_resuelve_el_municipio() {
    let c = ctx();
    let id = c.client.crear_obra(
        &c.municipio,
        &texto(&c.env, "Puente"),
        &c.contratista,
        &c.inspector,
        &c.veedor,
        &c.municipio, // árbitro = municipio (permitido)
        &c.token,
        &hitos(&c.env, &MONTOS),
        &PERIODO,
    );
    c.declarar(id, 0);
    c.objetar(id, 0);
    let con_firma = |firmante: &Address| {
        c.env.mock_auths(&[MockAuth {
            address: firmante,
            invoke: &MockAuthInvoke {
                contract: &c.id,
                fn_name: "resolver_objecion",
                args: (id, 0u32, Decision::Rechazar).into_val(&c.env),
                sub_invokes: &[],
            },
        }]);
        c.client.try_resolver_objecion(&id, &0, &Decision::Rechazar)
    };
    let r = con_firma(&c.arbitro); // otra cuenta: no
    assert!(matches!(r, Err(Err(_))), "{:?}", r);
    assert_eq!(con_firma(&c.municipio), Ok(Ok(())));
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Evidencia);
}

#[test]
fn resolver_un_hito_que_no_esta_objetado_es_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    // Pendiente.
    assert_err!(
        c.client.try_resolver_objecion(&id, &0, &Decision::Aceptar),
        Error::EstadoInvalido
    );
    assert_err!(
        c.client.try_resolver_objecion(&id, &0, &Decision::Rechazar),
        Error::EstadoInvalido
    );
    // Evidencia.
    c.declarar(id, 0);
    assert_err!(
        c.client.try_resolver_objecion(&id, &0, &Decision::Aceptar),
        Error::EstadoInvalido
    );
    // Aprobado.
    c.aprobar_inspector(id, 0);
    c.aprobar_veedor(id, 0);
    assert_err!(
        c.client.try_resolver_objecion(&id, &0, &Decision::Rechazar),
        Error::EstadoInvalido
    );
    // Pagado.
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &0);
    assert_err!(
        c.client.try_resolver_objecion(&id, &0, &Decision::Aceptar),
        Error::EstadoInvalido
    );
    assert_err!(
        c.client.try_resolver_objecion(&id, &0, &Decision::Rechazar),
        Error::EstadoInvalido
    );
}

#[test]
fn resolver_dos_veces_la_misma_objecion_es_estado_invalido() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Rechazar);
    assert_err!(
        c.client.try_resolver_objecion(&id, &0, &Decision::Rechazar),
        Error::EstadoInvalido
    );
    assert_err!(
        c.client.try_resolver_objecion(&id, &0, &Decision::Aceptar),
        Error::EstadoInvalido
    );
}

#[test]
fn aceptar_con_el_inspector_ya_aprobado_limpia_todo() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    c.objetar(id, 0);
    let antes = c.hito(id, 0);
    assert!(antes.aprobo_inspector && antes.objecion_usada);
    assert!(antes.evidencia_hash.is_some() && antes.motivo_objecion_hash.is_some());

    c.resolver(id, 0, Decision::Aceptar);
    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Pendiente);
    assert!(!h.aprobo_inspector);
    assert!(!h.aprobo_veedor);
    assert!(!h.veedor_por_arbitro);
    assert!(!h.objecion_usada);
    assert_eq!(h.evidencia_hash, None);
    assert_eq!(h.momento_declaracion, None);
    assert_eq!(h.motivo_objecion_hash, None);
    assert_eq!(h.momento_aprobacion_completa, None);
    assert_eq!(h.momento_pago, None);
    // Lo inmutable no cambia.
    assert_eq!(h.indice, 0);
    assert_eq!(h.monto_original, MONTOS[0]);
    assert_eq!(h.monto_vigente, MONTOS[0]);
    // El hito queda como uno recién creado.
    let nuevo = c.hito(c.crear(), 0);
    assert_eq!(h, nuevo);
}

#[test]
fn aceptar_sin_aprobaciones_previas_tambien_limpia() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Aceptar);
    assert_eq!(c.hito(id, 0), c.hito(c.crear(), 0));
}

#[test]
fn tras_aceptar_se_redeclara_con_periodo_nuevo_y_una_objecion_disponible() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0); // declarado en T0; período viejo hasta T0 + PERIODO
    c.avanzar(300);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Aceptar);

    // Re-declara con otra evidencia en T0 + 500.
    c.ir_a(T0 + 500);
    c.client.declarar_hito(&id, &0, &hash(&c.env, 2));
    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Evidencia);
    assert_eq!(h.evidencia_hash, Some(hash(&c.env, 2)));
    assert_eq!(h.momento_declaracion, Some(T0 + 500));
    assert!(!h.objecion_usada);

    // Fuera del período VIEJO pero dentro del nuevo: el veedor puede objetar otra vez.
    c.ir_a(T0 + PERIODO);
    c.objetar(id, 0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Objetado);

    // Y el árbitro acepta de nuevo; tercera declaración.
    c.resolver(id, 0, Decision::Aceptar);
    c.client.declarar_hito(&id, &0, &hash(&c.env, 3));
    assert_eq!(c.hito(id, 0).momento_declaracion, Some(T0 + PERIODO));
}

#[test]
fn tras_aceptar_el_borde_del_periodo_nuevo_es_fin_menos_1_si_y_fin_no() {
    let c = ctx();
    let a = c.crear();
    let b = c.crear();
    for o in [a, b] {
        c.declarar(o, 0);
        c.objetar(o, 0);
        c.resolver(o, 0, Decision::Aceptar);
    }
    c.ir_a(T0 + 500);
    c.declarar(a, 0);
    c.declarar(b, 0);
    let fin_nuevo = T0 + 500 + PERIODO;

    c.ir_a(fin_nuevo - 1);
    c.objetar(a, 0);
    assert_eq!(c.hito(a, 0).estado, EstadoHito::Objetado);
    c.ir_a(fin_nuevo);
    assert_err!(
        c.client.try_objetar(&b, &0, &hash(&c.env, 9)),
        Error::FueraDePeriodo
    );
}

#[test]
fn camino_completo_hasta_el_pago_tras_aceptar() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    c.avanzar(100);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Aceptar);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::EstadoInvalido);

    // Re-declaración y recorrido normal: el pago respeta el período NUEVO.
    c.avanzar(200);
    let t_nuevo = c.ahora();
    c.client.declarar_hito(&id, &0, &hash(&c.env, 2));
    c.aprobar_inspector(id, 0);
    c.aprobar_veedor(id, 0);
    c.ir_a(t_nuevo + PERIODO - 1);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::PeriodoNoCumplido);
    c.ir_a(t_nuevo + PERIODO);
    c.client.liberar_pago(&id, &0);
    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Pagado);
    assert_eq!(h.momento_pago, Some(t_nuevo + PERIODO));
    assert_eq!(c.tok.balance(&c.contratista), MONTOS[0]);
}

#[test]
fn rechazar_con_el_inspector_aprobado_deja_el_hito_aprobado() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    c.avanzar(100);
    c.objetar(id, 0);
    c.avanzar(100);
    c.resolver(id, 0, Decision::Rechazar);

    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Aprobado);
    assert!(h.aprobo_inspector);
    assert!(h.aprobo_veedor);
    assert!(h.veedor_por_arbitro);
    assert!(h.objecion_usada);
    assert_eq!(h.momento_aprobacion_completa, Some(T0 + 200));
    assert_eq!(h.momento_declaracion, Some(T0));
    assert_eq!(h.motivo_objecion_hash, Some(hash(&c.env, 9)));

    // Se paga cuando se cumple el período ORIGINAL (desde la declaración).
    c.ir_a(T0 + PERIODO - 1);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::PeriodoNoCumplido);
    c.ir_a(T0 + PERIODO);
    c.client.liberar_pago(&id, &0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Pagado);
    assert_eq!(c.tok.balance(&c.contratista), MONTOS[0]);
}

#[test]
fn rechazar_despues_de_vencido_el_periodo_original_permite_pagar_en_el_acto() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    c.objetar(id, 0);
    c.avanzar(PERIODO * 3); // el árbitro tarda
    c.resolver(id, 0, Decision::Rechazar);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Aprobado);
    c.client.liberar_pago(&id, &0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Pagado);
}

#[test]
fn rechazar_sin_el_inspector_aprobado_deja_el_hito_en_evidencia() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Rechazar);

    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Evidencia);
    assert!(!h.aprobo_inspector);
    assert!(h.aprobo_veedor && h.veedor_por_arbitro && h.objecion_usada);
    assert_eq!(h.momento_aprobacion_completa, None);
    c.avanzar(PERIODO);
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::EstadoInvalido);

    // Cuando aprueba el inspector, queda Aprobado y se paga.
    c.aprobar_inspector(id, 0);
    let h = c.hito(id, 0);
    assert_eq!(h.estado, EstadoHito::Aprobado);
    assert_eq!(h.momento_aprobacion_completa, Some(c.ahora()));
    assert!(h.veedor_por_arbitro);
    c.client.liberar_pago(&id, &0);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Pagado);
}

#[test]
fn tras_rechazar_el_veedor_no_puede_objetar_ni_aprobar() {
    for con_inspector in [false, true] {
        let c = ctx();
        let id = c.crear();
        c.declarar(id, 0);
        if con_inspector {
            c.aprobar_inspector(id, 0);
        }
        c.objetar(id, 0);
        c.resolver(id, 0, Decision::Rechazar);
        assert_err!(
            c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
            Error::ObjecionYaUsada
        );
        assert_err!(c.client.try_aprobar(&id, &0, &c.veedor), Error::YaDecidio);
    }
}

#[test]
fn con_el_hito_n_objetado_el_n_mas_1_queda_bloqueado() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    c.objetar(id, 0);

    // Declarar el 1: HitoAnteriorPendiente.
    assert_err!(
        c.client.try_declarar_hito(&id, &1, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
    // Liberar el 1 (Pendiente) y aprobarlo: también.
    assert_err!(
        c.client.try_liberar_pago(&id, &1),
        Error::HitoAnteriorPendiente
    );
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.inspector),
        Error::HitoAnteriorPendiente
    );
    // Con el 1 forzado a Evidencia y a Aprobado (no se llega por API) sigue igual.
    c.forzar_estado(id, 1, EstadoHito::Evidencia);
    assert_err!(
        c.client.try_aprobar(&id, &1, &c.veedor),
        Error::HitoAnteriorPendiente
    );
    c.forzar_hito(id, 1, |h| {
        h.estado = EstadoHito::Aprobado;
        h.momento_declaracion = Some(T0);
    });
    c.avanzar(PERIODO * 2);
    assert_err!(
        c.client.try_liberar_pago(&id, &1),
        Error::HitoAnteriorPendiente
    );
}

#[test]
fn el_hito_n_mas_1_se_destraba_con_rechazar_pero_no_con_aceptar() {
    // Rechazar sin inspector: el 0 queda en Evidencia -> el 1 sigue bloqueado.
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Rechazar);
    assert_err!(
        c.client.try_declarar_hito(&id, &1, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
    c.aprobar_inspector(id, 0); // ahora Aprobado
    c.declarar(id, 1);
    assert_eq!(c.hito(id, 1).estado, EstadoHito::Evidencia);

    // Aceptar: el 0 vuelve a Pendiente -> el 1 sigue bloqueado.
    let b = c.crear();
    c.declarar(b, 0);
    c.objetar(b, 0);
    c.resolver(b, 0, Decision::Aceptar);
    assert_err!(
        c.client.try_declarar_hito(&b, &1, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
}

#[test]
fn obra_y_hito_inexistentes() {
    let c = ctx();
    let id = c.crear();
    assert_err!(
        c.client.try_resolver_objecion(&0, &0, &Decision::Aceptar),
        Error::ObraNoExiste
    );
    assert_err!(
        c.client.try_resolver_objecion(&99, &0, &Decision::Rechazar),
        Error::ObraNoExiste
    );
    assert_err!(
        c.client.try_resolver_objecion(&id, &4, &Decision::Aceptar),
        Error::HitoNoExiste
    );
    assert_err!(
        c.client
            .try_resolver_objecion(&id, &u32::MAX, &Decision::Rechazar),
        Error::HitoNoExiste
    );
}
