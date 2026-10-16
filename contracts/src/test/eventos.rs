//! §4: cada función emite su evento con los topics y datos acordados. Se compara contra el struct
//! del evento (`to_xdr`) y, para el formato on-chain que lee el indexador, contra topics y datos
//! armados a mano.

use soroban_sdk::{
    testutils::{ContractEvents, Events as _},
    vec, Event as _, IntoVal, Map, Symbol, Val, Vec,
};

use super::comun::*;
use crate::{Error, HitoAprobado, HitoDeclarado, ObraCreada, ObraFondeada, PagoLiberado};

/// Eventos del contrato en la última invocación (el SAC emite también los suyos).
pub(super) fn del_contrato(c: &Ctx) -> ContractEvents {
    c.env.events().all().filter_by_contract(&c.id)
}

#[test]
fn crear_obra_emite_obra_creada() {
    let c = ctx();
    let id = c.crear();
    assert_eq!(
        del_contrato(&c),
        [ObraCreada {
            obra: id,
            nombre: texto(&c.env, "Puente"),
            municipio: c.municipio.clone(),
            contratista: c.contratista.clone(),
            inspector: c.inspector.clone(),
            veedor: c.veedor.clone(),
            arbitro: c.arbitro.clone(),
            token: c.token.clone(),
            monto_original: TOTAL,
            cantidad_hitos: 4,
            periodo_objecion: PERIODO,
        }
        .to_xdr(&c.env, &c.id)]
    );
}

#[test]
fn fondear_emite_obra_fondeada_con_el_acumulado() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, 300);
    assert_eq!(
        del_contrato(&c),
        [ObraFondeada {
            obra: id,
            monto: 300,
            fondeado: 300
        }
        .to_xdr(&c.env, &c.id)]
    );
    c.fondear(id, 200);
    assert_eq!(
        del_contrato(&c),
        [ObraFondeada {
            obra: id,
            monto: 200,
            fondeado: 500
        }
        .to_xdr(&c.env, &c.id)]
    );
}

#[test]
fn fondear_tambien_deja_el_evento_de_transferencia_del_sac() {
    // La lista completa tiene el evento del contrato y el `transfer` del token.
    let c = ctx();
    let id = c.crear();
    c.fondear(id, 300);
    let todos = c.env.events().all();
    let propios = del_contrato(&c);
    assert_eq!(propios.events().len(), 1);
    assert!(todos.events().len() > propios.events().len());
    let _ = id;
}

#[test]
fn declarar_hito_emite_hito_declarado_con_fin_de_periodo() {
    let c = ctx();
    let id = c.crear();
    c.avanzar(77);
    c.client.declarar_hito(&id, &0, &hash(&c.env, 5));
    assert_eq!(
        del_contrato(&c),
        [HitoDeclarado {
            obra: id,
            hito: 0,
            evidencia_hash: hash(&c.env, 5),
            fin_periodo: T0 + 77 + PERIODO,
        }
        .to_xdr(&c.env, &c.id)]
    );
}

#[test]
fn aprobar_emite_hito_aprobado_completo_false_y_luego_true() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);

    c.aprobar_inspector(id, 0);
    assert_eq!(
        del_contrato(&c),
        [HitoAprobado {
            obra: id,
            hito: 0,
            firmante: c.inspector.clone(),
            completo: false
        }
        .to_xdr(&c.env, &c.id)]
    );
    c.aprobar_veedor(id, 0);
    assert_eq!(
        del_contrato(&c),
        [HitoAprobado {
            obra: id,
            hito: 0,
            firmante: c.veedor.clone(),
            completo: true
        }
        .to_xdr(&c.env, &c.id)]
    );
}

#[test]
fn liberar_pago_emite_pago_liberado_con_el_acumulado() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar_y_aprobar(id, 0);
    c.declarar_y_aprobar(id, 1);
    c.avanzar(PERIODO);

    c.client.liberar_pago(&id, &0);
    assert_eq!(
        del_contrato(&c),
        [PagoLiberado {
            obra: id,
            hito: 0,
            contratista: c.contratista.clone(),
            monto: MONTOS[0],
            pagado: MONTOS[0],
        }
        .to_xdr(&c.env, &c.id)]
    );
    c.client.liberar_pago(&id, &1);
    assert_eq!(
        del_contrato(&c),
        [PagoLiberado {
            obra: id,
            hito: 1,
            contratista: c.contratista.clone(),
            monto: MONTOS[1],
            pagado: MONTOS[0] + MONTOS[1],
        }
        .to_xdr(&c.env, &c.id)]
    );
}

#[test]
fn formato_on_chain_de_declarado_y_pagado_topics_y_mapa() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    c.declarar(id, 0);
    // `evidencia_hash` y `fin_periodo` superan los 9 caracteres de `symbol_short!`.
    let evidencia = Symbol::new(&c.env, "evidencia_hash");
    let fin = Symbol::new(&c.env, "fin_periodo");
    let esperado: Vec<(soroban_sdk::Address, Vec<Val>, Val)> = vec![
        &c.env,
        (
            c.id.clone(),
            vec![
                &c.env,
                Symbol::new(&c.env, "declarado").into_val(&c.env),
                id.into_val(&c.env),
                0u32.into_val(&c.env),
            ],
            Map::<Symbol, Val>::from_array(
                &c.env,
                [
                    (evidencia, hash(&c.env, 1).into_val(&c.env)),
                    (fin, (T0 + PERIODO).into_val(&c.env)),
                ],
            )
            .into_val(&c.env),
        ),
    ];
    assert_eq!(del_contrato(&c), esperado);
}

#[test]
fn formato_on_chain_de_fondeada_topics_y_mapa() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, 250);
    let esperado: Vec<(soroban_sdk::Address, Vec<Val>, Val)> = vec![
        &c.env,
        (
            c.id.clone(),
            vec![
                &c.env,
                Symbol::new(&c.env, "fondeada").into_val(&c.env),
                id.into_val(&c.env),
            ],
            Map::<Symbol, Val>::from_array(
                &c.env,
                [
                    (Symbol::new(&c.env, "monto"), 250i128.into_val(&c.env)),
                    (Symbol::new(&c.env, "fondeado"), 250i128.into_val(&c.env)),
                ],
            )
            .into_val(&c.env),
        ),
    ];
    assert_eq!(del_contrato(&c), esperado);
}

#[test]
fn una_llamada_con_error_no_deja_eventos_del_contrato() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);

    // Cada una falla con un error distinto y no debe dejar eventos del contrato.
    assert_err!(
        c.client.try_fondear(&id, &(TOTAL + 1)),
        Error::ExcedeMontoTotal
    );
    assert!(del_contrato(&c).events().is_empty());
    assert_err!(c.client.try_fondear(&id, &0), Error::MontoInvalido);
    assert!(del_contrato(&c).events().is_empty());
    assert_err!(
        c.client.try_declarar_hito(&id, &0, &hash(&c.env, 1)),
        Error::EstadoInvalido
    );
    assert!(del_contrato(&c).events().is_empty());
    assert_err!(
        c.client.try_aprobar(&id, &0, &c.arbitro),
        Error::NoAutorizado
    );
    assert!(del_contrato(&c).events().is_empty());
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::EstadoInvalido);
    assert!(del_contrato(&c).events().is_empty());
    let r = c.client.try_crear_obra(
        &c.municipio,
        &texto(&c.env, "x"),
        &c.contratista,
        &c.inspector,
        &c.veedor,
        &c.arbitro,
        &c.token,
        &vacio(&c.env),
        &PERIODO,
    );
    assert_err!(r, Error::MontoInvalido);
    assert!(del_contrato(&c).events().is_empty());
}

#[test]
fn las_lecturas_no_emiten_eventos() {
    let c = ctx();
    let id = c.crear();
    c.client.ver_obra(&id);
    assert!(del_contrato(&c).events().is_empty());
    c.client.ver_hitos(&id);
    assert!(del_contrato(&c).events().is_empty());
    c.client.cantidad_obras();
    assert!(del_contrato(&c).events().is_empty());
}
