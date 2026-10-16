//! §3.2 `fondear`.

use super::comun::*;
use crate::Error;

#[test]
fn fondear_mueve_tokens_y_acumula() {
    let c = ctx();
    let id = c.crear();
    let antes = c.tok.balance(&c.municipio);
    c.fondear(id, 300);
    assert_eq!(c.client.ver_obra(&id).fondeado, 300);
    assert_eq!(c.tok.balance(&c.id), 300);
    assert_eq!(c.tok.balance(&c.municipio), antes - 300);
    c.fondear(id, 200);
    assert_eq!(c.client.ver_obra(&id).fondeado, 500);
    assert_eq!(c.tok.balance(&c.id), 500);
}

#[test]
fn fondear_justo_el_total_esta_permitido() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    assert_eq!(c.client.ver_obra(&id).fondeado, TOTAL);
}

#[test]
fn fondear_de_mas_de_una_vez_falla_y_no_mueve_nada() {
    let c = ctx();
    let id = c.crear();
    assert_err!(
        c.client.try_fondear(&id, &(TOTAL + 1)),
        Error::ExcedeMontoTotal
    );
    assert_eq!(c.client.ver_obra(&id).fondeado, 0);
    assert_eq!(c.tok.balance(&c.id), 0);
}

#[test]
fn fondear_de_mas_acumulando() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, 600);
    assert_err!(c.client.try_fondear(&id, &401), Error::ExcedeMontoTotal);
    assert_eq!(c.client.ver_obra(&id).fondeado, 600);
    c.fondear(id, 400); // justo el total
    assert_err!(c.client.try_fondear(&id, &1), Error::ExcedeMontoTotal);
    assert_eq!(c.client.ver_obra(&id).fondeado, TOTAL);
}

#[test]
fn fondear_con_monto_enorme_no_desborda() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, 1);
    assert_err!(
        c.client.try_fondear(&id, &i128::MAX),
        Error::ExcedeMontoTotal
    );
}

#[test]
fn fondear_con_cero_o_negativo_es_monto_invalido() {
    let c = ctx();
    let id = c.crear();
    assert_err!(c.client.try_fondear(&id, &0), Error::MontoInvalido);
    assert_err!(c.client.try_fondear(&id, &-1), Error::MontoInvalido);
    assert_err!(c.client.try_fondear(&id, &i128::MIN), Error::MontoInvalido);
}

#[test]
fn obra_inexistente_incluida_la_cero() {
    let c = ctx();
    assert_err!(c.client.try_fondear(&0, &10), Error::ObraNoExiste);
    assert_err!(c.client.try_fondear(&1, &10), Error::ObraNoExiste);
    c.crear();
    assert_err!(c.client.try_fondear(&2, &10), Error::ObraNoExiste);
}

#[test]
fn obra_no_existe_antes_que_monto_invalido() {
    let c = ctx();
    assert_err!(c.client.try_fondear(&9, &0), Error::ObraNoExiste);
}

#[test]
fn monto_invalido_antes_que_excede_monto_total() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    assert_err!(c.client.try_fondear(&id, &0), Error::MontoInvalido);
    assert_err!(c.client.try_fondear(&id, &-5), Error::MontoInvalido);
}

#[test]
fn el_fondeo_de_una_obra_no_afecta_a_la_otra() {
    let c = ctx();
    let a = c.crear();
    let b = c.crear();
    c.fondear(a, 100);
    assert_eq!(c.client.ver_obra(&a).fondeado, 100);
    assert_eq!(c.client.ver_obra(&b).fondeado, 0);
}
