//! §3.1 `crear_obra`: roles, montos e ids.

use soroban_sdk::{testutils::Address as _, Address};

use super::comun::*;
use crate::{Error, EstadoHito, EstadoObra};

#[test]
fn crea_obra_con_ids_desde_1_y_estado_inicial() {
    let c = ctx();
    assert_eq!(c.client.cantidad_obras(), 0);
    let id = c.crear();
    assert_eq!(id, 1);
    assert_eq!(c.client.cantidad_obras(), 1);

    let o = c.client.ver_obra(&id);
    assert_eq!(o.id, 1);
    assert_eq!(o.nombre, texto(&c.env, "Puente"));
    assert_eq!(o.municipio, c.municipio);
    assert_eq!(o.contratista, c.contratista);
    assert_eq!(o.inspector, c.inspector);
    assert_eq!(o.veedor, c.veedor);
    assert_eq!(o.arbitro, c.arbitro);
    assert_eq!(o.token, c.token);
    assert_eq!(o.monto_original, TOTAL);
    assert_eq!(o.monto_vigente, TOTAL);
    assert_eq!((o.fondeado, o.pagado), (0, 0));
    assert_eq!(o.periodo_objecion, PERIODO);
    assert_eq!(o.cantidad_hitos, 4);
    assert_eq!(o.estado, EstadoObra::Activa);
    assert_eq!(o.creada_en, T0);

    for i in 0..4u32 {
        let h = c.hito(id, i);
        assert_eq!(h.indice, i);
        assert_eq!(h.monto_original, MONTOS[i as usize]);
        assert_eq!(h.monto_vigente, MONTOS[i as usize]);
        assert_eq!(h.estado, EstadoHito::Pendiente);
        assert_eq!(h.evidencia_hash, None);
        assert_eq!(h.momento_declaracion, None);
        assert!(!h.aprobo_inspector && !h.aprobo_veedor);
        assert!(!h.veedor_por_arbitro && !h.objecion_usada);
        assert_eq!(h.motivo_objecion_hash, None);
        assert_eq!(h.momento_aprobacion_completa, None);
        assert_eq!(h.momento_pago, None);
    }
}

#[test]
fn los_ids_suben_de_a_uno_y_las_obras_son_independientes() {
    let c = ctx();
    assert_eq!(c.crear(), 1);
    assert_eq!(c.crear_con(&[5], 7), 2);
    assert_eq!(c.crear(), 3);
    assert_eq!(c.client.cantidad_obras(), 3);
    assert_eq!(c.client.ver_obra(&2).cantidad_hitos, 1);
    assert_eq!(c.client.ver_obra(&2).monto_vigente, 5);
    assert_eq!(c.client.ver_obra(&2).periodo_objecion, 7);
    assert_eq!(c.client.ver_obra(&3).cantidad_hitos, 4);
}

#[test]
fn una_obra_con_un_solo_hito_es_valida() {
    let c = ctx();
    let id = c.crear_con(&[1], 0);
    assert_eq!(c.client.ver_hitos(&id).len(), 1);
}

fn intentar(
    c: &Ctx,
    municipio: &Address,
    contratista: &Address,
    inspector: &Address,
    veedor: &Address,
    arbitro: &Address,
) -> Result<u32, Error> {
    // `Err(Ok(e))` es un error del contrato; cualquier otra cosa hace fallar la prueba.
    match c.client.try_crear_obra(
        municipio,
        &texto(&c.env, "Puente"),
        contratista,
        inspector,
        veedor,
        arbitro,
        &c.token,
        &hitos(&c.env, &MONTOS),
        &PERIODO,
    ) {
        Ok(Ok(id)) => Ok(id),
        Err(Ok(e)) => Err(e),
        otro => panic!("resultado inesperado: {:?}", otro),
    }
}

#[test]
fn roles_duplicados_en_los_seis_pares_de_contratista_inspector_veedor_arbitro() {
    let c = ctx();
    let m = &c.municipio;
    let (co, i, v, a) = (&c.contratista, &c.inspector, &c.veedor, &c.arbitro);
    let x = Address::generate(&c.env); // dirección libre para el control

    // (contratista, inspector, veedor, árbitro) con exactamente un par repetido.
    let casos: [(&Address, &Address, &Address, &Address); 6] = [
        (co, co, v, a), // contratista = inspector
        (co, i, co, a), // contratista = veedor
        (co, i, v, co), // contratista = árbitro
        (co, i, i, a),  // inspector = veedor
        (co, i, v, i),  // inspector = árbitro
        (co, i, v, v),  // veedor = árbitro
    ];
    for (k, (ct, ins, ve, ar)) in casos.iter().enumerate() {
        assert_eq!(
            intentar(&c, m, ct, ins, ve, ar),
            Err(Error::RolesDuplicados),
            "par {}",
            k
        );
    }
    // Control: con direcciones todas distintas se crea.
    assert_eq!(intentar(&c, m, co, i, v, &x), Ok(1));
}

#[test]
fn municipio_igual_a_contratista_inspector_o_veedor_es_rechazado() {
    let c = ctx();
    let (co, i, v, a) = (&c.contratista, &c.inspector, &c.veedor, &c.arbitro);
    assert_eq!(intentar(&c, co, co, i, v, a), Err(Error::RolesDuplicados));
    assert_eq!(intentar(&c, i, co, i, v, a), Err(Error::RolesDuplicados));
    assert_eq!(intentar(&c, v, co, i, v, a), Err(Error::RolesDuplicados));
}

#[test]
fn municipio_igual_a_arbitro_esta_permitido() {
    let c = ctx();
    let id = intentar(
        &c,
        &c.municipio,
        &c.contratista,
        &c.inspector,
        &c.veedor,
        &c.municipio,
    )
    .expect("el municipio puede ser el árbitro");
    assert_eq!(id, 1);
    let o = c.client.ver_obra(&id);
    assert_eq!(o.municipio, o.arbitro);
}

#[test]
fn monto_invalido_con_lista_vacia_monto_cero_o_negativo() {
    let c = ctx();
    let intento = |montos: &[i128]| {
        c.client.try_crear_obra(
            &c.municipio,
            &texto(&c.env, "x"),
            &c.contratista,
            &c.inspector,
            &c.veedor,
            &c.arbitro,
            &c.token,
            &hitos(&c.env, montos),
            &PERIODO,
        )
    };
    assert_err!(intento(&[]), Error::MontoInvalido);
    assert_err!(intento(&[0]), Error::MontoInvalido);
    assert_err!(intento(&[-5]), Error::MontoInvalido);
    assert_err!(intento(&[100, 0, 100]), Error::MontoInvalido);
    assert_err!(intento(&[100, 100, -1]), Error::MontoInvalido);
    assert_eq!(c.client.cantidad_obras(), 0);
}

#[test]
fn monto_invalido_si_la_suma_desborda_i128() {
    let c = ctx();
    let r = c.client.try_crear_obra(
        &c.municipio,
        &texto(&c.env, "x"),
        &c.contratista,
        &c.inspector,
        &c.veedor,
        &c.arbitro,
        &c.token,
        &hitos(&c.env, &[i128::MAX, 1]),
        &PERIODO,
    );
    assert_err!(r, Error::MontoInvalido);
    // Un solo hito con i128::MAX no desborda.
    assert_eq!(c.crear_con(&[i128::MAX], PERIODO), 1);
}

#[test]
fn roles_duplicados_se_evalua_antes_que_monto_invalido() {
    let c = ctx();
    let r = c.client.try_crear_obra(
        &c.municipio,
        &texto(&c.env, "x"),
        &c.contratista,
        &c.contratista, // inspector duplicado
        &c.veedor,
        &c.arbitro,
        &c.token,
        &vacio(&c.env), // y además lista vacía
        &PERIODO,
    );
    assert_err!(r, Error::RolesDuplicados);
}

#[test]
fn una_creacion_fallida_no_consume_id() {
    let c = ctx();
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
    assert_eq!(c.client.cantidad_obras(), 0);
    assert_eq!(c.crear(), 1);
}
