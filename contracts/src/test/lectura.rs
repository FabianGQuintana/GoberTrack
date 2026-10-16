//! §3.8 lectura: `ver_obra`, `ver_hito`, `ver_hitos`, `cantidad_obras`.

use super::comun::*;
use crate::{Error, EstadoHito};

#[test]
fn cantidad_obras_arranca_en_cero_y_sube_con_cada_obra() {
    let c = ctx();
    assert_eq!(c.client.cantidad_obras(), 0);
    for esperado in 1..=3u32 {
        assert_eq!(c.crear(), esperado);
        assert_eq!(c.client.cantidad_obras(), esperado);
    }
}

#[test]
fn ver_hitos_devuelve_todos_en_orden() {
    let c = ctx();
    let id = c.crear();
    let hs = c.client.ver_hitos(&id);
    assert_eq!(hs.len(), 4);
    for i in 0..4u32 {
        let h = hs.get(i).unwrap();
        assert_eq!(h.indice, i);
        assert_eq!(h.monto_vigente, MONTOS[i as usize]);
        assert_eq!(h, c.hito(id, i));
    }
}

#[test]
fn ver_hitos_refleja_los_cambios_de_estado() {
    let c = ctx();
    let id = c.crear();
    c.declarar_y_aprobar(id, 0);
    c.declarar(id, 1);
    let hs = c.client.ver_hitos(&id);
    assert_eq!(hs.get(0).unwrap().estado, EstadoHito::Aprobado);
    assert_eq!(hs.get(1).unwrap().estado, EstadoHito::Evidencia);
    assert_eq!(hs.get(2).unwrap().estado, EstadoHito::Pendiente);
    assert_eq!(hs.get(3).unwrap().estado, EstadoHito::Pendiente);
}

#[test]
fn ver_hitos_de_cada_obra_son_los_suyos() {
    let c = ctx();
    let a = c.crear();
    let b = c.crear_con(&[7, 8], 1);
    assert_eq!(c.client.ver_hitos(&a).len(), 4);
    assert_eq!(c.client.ver_hitos(&b).len(), 2);
    assert_eq!(c.client.ver_hitos(&b).get(1).unwrap().monto_vigente, 8);
}

#[test]
fn obra_inexistente_incluida_la_cero_en_las_tres_lecturas() {
    let c = ctx();
    assert_err!(c.client.try_ver_obra(&0), Error::ObraNoExiste);
    assert_err!(c.client.try_ver_obra(&1), Error::ObraNoExiste);
    assert_err!(c.client.try_ver_hito(&0, &0), Error::ObraNoExiste);
    assert_err!(c.client.try_ver_hito(&1, &0), Error::ObraNoExiste);
    assert_err!(c.client.try_ver_hitos(&0), Error::ObraNoExiste);
    assert_err!(c.client.try_ver_hitos(&1), Error::ObraNoExiste);
    c.crear();
    assert_err!(c.client.try_ver_obra(&2), Error::ObraNoExiste);
    assert_err!(c.client.try_ver_hito(&2, &0), Error::ObraNoExiste);
    assert_err!(c.client.try_ver_hitos(&2), Error::ObraNoExiste);
    assert_err!(c.client.try_ver_obra(&0), Error::ObraNoExiste);
}

#[test]
fn hito_inexistente_con_indice_igual_a_la_cantidad() {
    let c = ctx();
    let id = c.crear();
    assert_err!(c.client.try_ver_hito(&id, &4), Error::HitoNoExiste);
    assert_err!(c.client.try_ver_hito(&id, &5), Error::HitoNoExiste);
    assert_err!(c.client.try_ver_hito(&id, &u32::MAX), Error::HitoNoExiste);
    assert!(c.client.try_ver_hito(&id, &3).is_ok());
}

#[test]
fn obra_no_existe_antes_que_hito_no_existe() {
    let c = ctx();
    assert_err!(c.client.try_ver_hito(&9, &99), Error::ObraNoExiste);
}
