//! Invariante 7 (§0): cada función pide la firma de la dirección correcta.

use soroban_sdk::{
    symbol_short,
    testutils::{AuthorizedFunction, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, Symbol,
};

use super::comun::*;
use crate::Error;

/// Firmantes registrados en la última invocación y el nombre de la función raíz de cada uno.
pub(super) fn firmas(c: &Ctx) -> super::std::vec::Vec<(Address, Symbol)> {
    c.env
        .auths()
        .into_iter()
        .map(|(a, inv)| match inv.function {
            AuthorizedFunction::Contract((_, f, _)) => (a, f),
            _ => panic!("la raíz no es una llamada a contrato"),
        })
        .collect()
}

pub(super) fn s(env: &Env, n: &str) -> Symbol {
    Symbol::new(env, n)
}

#[test]
fn crear_obra_pide_la_firma_del_municipio() {
    let c = ctx();
    c.crear();
    assert_eq!(firmas(&c), [(c.municipio.clone(), s(&c.env, "crear_obra"))]);
}

#[test]
fn fondear_pide_la_firma_del_municipio() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, 100);
    let f = firmas(&c);
    assert!(!f.is_empty());
    assert!(f.iter().all(|(a, _)| *a == c.municipio));
    assert_eq!(f[0].1, s(&c.env, "fondear"));
}

#[test]
fn declarar_hito_pide_la_firma_del_contratista() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    assert_eq!(
        firmas(&c),
        [(c.contratista.clone(), s(&c.env, "declarar_hito"))]
    );
}

#[test]
fn aprobar_pide_la_firma_del_firmante() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    assert_eq!(firmas(&c), [(c.inspector.clone(), s(&c.env, "aprobar"))]);
    c.aprobar_veedor(id, 0);
    assert_eq!(firmas(&c), [(c.veedor.clone(), s(&c.env, "aprobar"))]);
}

#[test]
fn liberar_pago_no_pide_ninguna_firma() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    c.client.liberar_pago(&id, &0);
    assert!(firmas(&c).is_empty());
}

#[test]
fn liberar_pago_funciona_sin_ninguna_autorizacion_mockeada() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.avanzar(PERIODO);
    c.env.set_auths(&[]); // desactiva el mock: ahora se exigen firmas reales
    c.client.liberar_pago(&id, &0);
    assert_eq!(c.tok.balance(&c.contratista), MONTOS[0]);
}

#[test]
fn declarar_hito_firmado_por_otra_cuenta_falla_con_error_de_autorizacion_del_host() {
    let c = ctx();
    let id = c.crear();
    let h = hash(&c.env, 1);
    let con_firma = |firmante: &Address| {
        c.env.mock_auths(&[MockAuth {
            address: firmante,
            invoke: &MockAuthInvoke {
                contract: &c.id,
                fn_name: "declarar_hito",
                args: (id, 0u32, h.clone()).into_val(&c.env),
                sub_invokes: &[],
            },
        }]);
        c.client.try_declarar_hito(&id, &0, &h)
    };
    // Firma el veedor (equivocado): error del host, no del contrato.
    let r = con_firma(&c.veedor);
    assert!(matches!(r, Err(Err(_))), "{:?}", r);
    // Firma el municipio: tampoco.
    let r = con_firma(&c.municipio);
    assert!(matches!(r, Err(Err(_))), "{:?}", r);
    // Control: firma el contratista.
    assert_eq!(con_firma(&c.contratista), Ok(Ok(())));
}

#[test]
fn aprobar_con_firma_de_otra_cuenta_falla_con_error_del_host() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    // `firmante = inspector`, pero firma el veedor.
    c.env.mock_auths(&[MockAuth {
        address: &c.veedor,
        invoke: &MockAuthInvoke {
            contract: &c.id,
            fn_name: "aprobar",
            args: (id, 0u32, c.inspector.clone()).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);
    let r = c.client.try_aprobar(&id, &0, &c.inspector);
    assert!(matches!(r, Err(Err(_))), "{:?}", r);
    assert!(!c.hito(id, 0).aprobo_inspector);
}

#[test]
fn fondear_con_firma_del_contratista_falla_con_error_del_host() {
    let c = ctx();
    let id = c.crear();
    c.env.mock_auths(&[MockAuth {
        address: &c.contratista,
        invoke: &MockAuthInvoke {
            contract: &c.id,
            fn_name: "fondear",
            args: (id, 100i128).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);
    let r = c.client.try_fondear(&id, &100);
    assert!(matches!(r, Err(Err(_))), "{:?}", r);
    assert_eq!(c.client.ver_obra(&id).fondeado, 0);
}

#[test]
fn crear_obra_sin_firma_falla_con_error_del_host() {
    let c = ctx();
    c.env.set_auths(&[]);
    let r = c.client.try_crear_obra(
        &c.municipio,
        &texto(&c.env, "x"),
        &c.contratista,
        &c.inspector,
        &c.veedor,
        &c.arbitro,
        &c.token,
        &hitos(&c.env, &MONTOS),
        &PERIODO,
    );
    assert!(matches!(r, Err(Err(_))), "{:?}", r);
    assert_eq!(c.client.cantidad_obras(), 0);
}

#[test]
fn no_autorizado_es_error_del_contrato_aunque_no_haya_firma() {
    // El rol se valida antes de pedir la firma (§3.4 pasos 2 y 3).
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.env.set_auths(&[]);
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.contratista),
        Error::NoAutorizado
    );
    let _ = symbol_short!("x");
}
