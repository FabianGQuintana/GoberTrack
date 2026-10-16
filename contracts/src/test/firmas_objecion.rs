//! Invariante 7, Fase 2: `objetar` pide al veedor y `resolver_objecion` al árbitro.

use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
    IntoVal,
};

use super::comun::*;
use super::firmas::{firmas, s};
use crate::{Decision, Error, EstadoHito};

#[test]
fn objetar_pide_la_firma_del_veedor() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    assert_eq!(firmas(&c), [(c.veedor.clone(), s(&c.env, "objetar"))]);
}

#[test]
fn resolver_objecion_pide_la_firma_del_arbitro() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Rechazar);
    assert_eq!(
        firmas(&c),
        [(c.arbitro.clone(), s(&c.env, "resolver_objecion"))]
    );
}

#[test]
fn objetar_con_firma_de_otra_cuenta_falla_con_error_del_host() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    let h = hash(&c.env, 9);
    for otro in [&c.inspector, &c.contratista, &c.arbitro, &c.municipio] {
        c.env.mock_auths(&[MockAuth {
            address: otro,
            invoke: &MockAuthInvoke {
                contract: &c.id,
                fn_name: "objetar",
                args: (id, 0u32, h.clone()).into_val(&c.env),
                sub_invokes: &[],
            },
        }]);
        let r = c.client.try_objetar(&id, &0, &h);
        assert!(matches!(r, Err(Err(_))), "{:?}", r);
    }
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Evidencia);
    // Control: firma el veedor.
    c.env.mock_auths(&[MockAuth {
        address: &c.veedor,
        invoke: &MockAuthInvoke {
            contract: &c.id,
            fn_name: "objetar",
            args: (id, 0u32, h.clone()).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(c.client.try_objetar(&id, &0, &h), Ok(Ok(())));
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Objetado);
}

#[test]
fn hito_inexistente_se_valida_antes_que_la_firma() {
    // Sin firmas reales, un hito inexistente da error del contrato y no del host.
    let c = ctx();
    let id = c.crear();
    c.env.set_auths(&[]);
    assert_err!(
        c.client.try_objetar(&id, &9, &hash(&c.env, 9)),
        Error::HitoNoExiste
    );
    assert_err!(
        c.client.try_resolver_objecion(&id, &9, &Decision::Aceptar),
        Error::HitoNoExiste
    );
}
