//! §4, Fase 2: eventos `objetado` y `resuelta`.
//!
//! Codificación on-chain de los enums `#[contracttype]` usados como valor de un campo del evento
//! (documentada en soroban-sdk-28.0.0/src/lib.rs, docs de `contracttype`, ~L739-750): un enum
//! con variantes unitarias se guarda como un Vec de un solo elemento con el nombre de la
//! variante como Symbol. Es decir, `Decision::Aceptar` = Vec[Symbol("Aceptar")] y
//! `EstadoHito::Aprobado` = Vec[Symbol("Aprobado")]. El backend tiene que decodificarlos así.

use soroban_sdk::{vec, Event as _, IntoVal, Map, Symbol, Val, Vec};

use super::comun::*;
use super::eventos::del_contrato;
use crate::{Decision, Error, EstadoHito, HitoObjetado, ObjecionResuelta};

/// `Vec[Symbol(nombre)]`: forma on-chain de una variante unitaria.
fn variante(c: &Ctx, nombre: &str) -> Val {
    let sym: Val = Symbol::new(&c.env, nombre).into_val(&c.env);
    vec![&c.env, sym].into_val(&c.env)
}

/// Un único evento esperado `(contrato, topics, datos)` con topics `[nombre, obra, hito]` y
/// datos en un mapa de dos campos.
fn evento_a_mano(
    c: &Ctx,
    nombre: &str,
    obra: u32,
    hito: u32,
    campos: [(&str, Val); 2],
) -> Vec<(soroban_sdk::Address, Vec<Val>, Val)> {
    let [(k1, v1), (k2, v2)] = campos;
    vec![
        &c.env,
        (
            c.id.clone(),
            vec![
                &c.env,
                Symbol::new(&c.env, nombre).into_val(&c.env),
                obra.into_val(&c.env),
                hito.into_val(&c.env),
            ],
            Map::<Symbol, Val>::from_array(
                &c.env,
                [(Symbol::new(&c.env, k1), v1), (Symbol::new(&c.env, k2), v2)],
            )
            .into_val(&c.env),
        ),
    ]
}

#[test]
fn objetar_emite_hito_objetado() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.client.objetar(&id, &0, &hash(&c.env, 7));
    assert_eq!(
        del_contrato(&c),
        [HitoObjetado {
            obra: id,
            hito: 0,
            motivo_hash: hash(&c.env, 7),
        }
        .to_xdr(&c.env, &c.id)]
    );
}

#[test]
fn formato_on_chain_de_objetado_topics_y_mapa() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.client.objetar(&id, &0, &hash(&c.env, 7));
    // Un solo campo de datos: mapa de una clave.
    let esperado: Vec<(soroban_sdk::Address, Vec<Val>, Val)> = vec![
        &c.env,
        (
            c.id.clone(),
            vec![
                &c.env,
                Symbol::new(&c.env, "objetado").into_val(&c.env),
                id.into_val(&c.env),
                0u32.into_val(&c.env),
            ],
            Map::<Symbol, Val>::from_array(
                &c.env,
                [(
                    Symbol::new(&c.env, "motivo_hash"),
                    hash(&c.env, 7).into_val(&c.env),
                )],
            )
            .into_val(&c.env),
        ),
    ];
    assert_eq!(del_contrato(&c), esperado);
}

fn verificar_resuelta(c: &Ctx, id: u32, decision: Decision, estado: EstadoHito, d: &str, e: &str) {
    assert_eq!(
        del_contrato(c),
        [ObjecionResuelta {
            obra: id,
            hito: 0,
            decision,
            estado,
        }
        .to_xdr(&c.env, &c.id)]
    );
    assert_eq!(
        del_contrato(c),
        evento_a_mano(
            c,
            "resuelta",
            id,
            0,
            [("decision", variante(c, d)), ("estado", variante(c, e))],
        )
    );
}

#[test]
fn resolver_aceptar_emite_resuelta_con_estado_pendiente() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Aceptar);
    verificar_resuelta(
        &c,
        id,
        Decision::Aceptar,
        EstadoHito::Pendiente,
        "Aceptar",
        "Pendiente",
    );
}

#[test]
fn resolver_rechazar_sin_inspector_emite_estado_evidencia() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Rechazar);
    verificar_resuelta(
        &c,
        id,
        Decision::Rechazar,
        EstadoHito::Evidencia,
        "Rechazar",
        "Evidencia",
    );
}

#[test]
fn resolver_rechazar_con_inspector_emite_estado_aprobado() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_inspector(id, 0);
    c.objetar(id, 0);
    c.resolver(id, 0, Decision::Rechazar);
    verificar_resuelta(
        &c,
        id,
        Decision::Rechazar,
        EstadoHito::Aprobado,
        "Rechazar",
        "Aprobado",
    );
}

#[test]
fn objetar_y_resolver_con_error_no_dejan_eventos_del_contrato() {
    let c = ctx();
    let id = c.crear();
    c.declarar(id, 0);
    c.aprobar_veedor(id, 0);
    assert_err!(
        c.client.try_objetar(&id, &0, &hash(&c.env, 9)),
        Error::YaDecidio
    );
    assert!(del_contrato(&c).events().is_empty());
    assert_err!(
        c.client.try_resolver_objecion(&id, &0, &Decision::Aceptar),
        Error::EstadoInvalido
    );
    assert!(del_contrato(&c).events().is_empty());
    assert_err!(
        c.client.try_objetar(&id, &9, &hash(&c.env, 9)),
        Error::HitoNoExiste
    );
    assert!(del_contrato(&c).events().is_empty());
}
