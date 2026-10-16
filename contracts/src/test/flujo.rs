//! Camino feliz completo de una obra de 4 hitos.

use super::comun::*;
use crate::{EstadoHito, EstadoObra};

#[test]
fn obra_de_cuatro_hitos_de_punta_a_punta() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    assert_eq!(c.tok.balance(&c.id), TOTAL);
    assert_eq!(c.tok.balance(&c.contratista), 0);

    let mut pagado = 0i128;
    for i in 0..4u32 {
        let monto = MONTOS[i as usize];
        let t_decl = c.ahora();

        // Declarar.
        c.declarar(id, i);
        let h = c.hito(id, i);
        assert_eq!(h.estado, EstadoHito::Evidencia);
        assert_eq!(h.momento_declaracion, Some(t_decl));

        // Aprobación del inspector.
        c.avanzar(10);
        c.aprobar_inspector(id, i);
        let h = c.hito(id, i);
        assert_eq!(h.estado, EstadoHito::Evidencia);
        assert!(h.aprobo_inspector && !h.aprobo_veedor);

        // Aprobación del veedor: queda Aprobado.
        c.avanzar(10);
        c.aprobar_veedor(id, i);
        let h = c.hito(id, i);
        assert_eq!(h.estado, EstadoHito::Aprobado);
        assert_eq!(h.momento_aprobacion_completa, Some(t_decl + 20));
        assert_eq!(h.momento_pago, None);

        // Todavía dentro del período: no se puede pagar.
        assert!(c.client.try_liberar_pago(&id, &i).is_err());

        // Fin del período: se paga.
        c.ir_a(t_decl + PERIODO);
        c.client.liberar_pago(&id, &i);
        pagado += monto;

        let h = c.hito(id, i);
        assert_eq!(h.estado, EstadoHito::Pagado);
        assert_eq!(h.momento_pago, Some(t_decl + PERIODO));
        assert_eq!(h.momento_declaracion, Some(t_decl));
        assert_eq!(h.momento_aprobacion_completa, Some(t_decl + 20));

        let o = c.client.ver_obra(&id);
        assert_eq!(o.pagado, pagado);
        assert_eq!(o.fondeado, TOTAL);
        assert_eq!(c.tok.balance(&c.id), TOTAL - pagado);
        assert_eq!(c.tok.balance(&c.contratista), pagado);
        // Finalizada recién al pagar el último hito.
        let esperado = if i == 3 {
            EstadoObra::Finalizada
        } else {
            EstadoObra::Activa
        };
        assert_eq!(o.estado, esperado, "estado de la obra tras el hito {}", i);

        // Los hitos posteriores siguen Pendientes.
        for j in (i + 1)..4 {
            assert_eq!(c.hito(id, j).estado, EstadoHito::Pendiente);
        }
    }

    assert_eq!(c.client.ver_obra(&id).monto_original, TOTAL);
    assert_eq!(c.client.ver_obra(&id).monto_vigente, TOTAL);
    assert_eq!(c.tok.balance(&c.id), 0);
}

#[test]
fn fondear_por_partes_a_medida_que_avanza_la_obra() {
    let c = ctx();
    let id = c.crear();
    for i in 0..4u32 {
        c.fondear(id, MONTOS[i as usize]);
        c.declarar_y_aprobar(id, i);
        c.avanzar(PERIODO);
        c.client.liberar_pago(&id, &i);
        assert_eq!(c.tok.balance(&c.id), 0);
    }
    let o = c.client.ver_obra(&id);
    assert_eq!(o.estado, EstadoObra::Finalizada);
    assert_eq!((o.fondeado, o.pagado), (TOTAL, TOTAL));
}

#[test]
fn dos_obras_en_paralelo_no_se_mezclan() {
    let c = ctx();
    let a = c.crear();
    let b = c.crear_con(&[50, 60], 10);
    c.fondear(a, TOTAL);
    c.fondear(b, 110);
    c.declarar_y_aprobar(b, 0);
    c.declarar_y_aprobar(b, 1);
    c.avanzar(10);
    c.client.liberar_pago(&b, &0);
    c.client.liberar_pago(&b, &1);
    assert_eq!(c.client.ver_obra(&b).estado, EstadoObra::Finalizada);
    assert_eq!(c.client.ver_obra(&a).estado, EstadoObra::Activa);
    assert_eq!(c.client.ver_obra(&a).pagado, 0);
    assert_eq!(c.tok.balance(&c.contratista), 110);
    assert_eq!(c.tok.balance(&c.id), TOTAL);
}
