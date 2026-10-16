//! Escenario de la demo (PRD §4) completo, en una sola prueba.

use soroban_sdk::Event as _;

use super::comun::*;
use super::eventos::del_contrato;
use crate::{
    Decision, Error, EstadoHito, EstadoObra, HitoAprobado, HitoDeclarado, HitoObjetado,
    ObjecionResuelta, ObraFondeada, PagoLiberado,
};

#[test]
fn demo_camino_feliz_trampa_objecion_y_destrabe() {
    let c = ctx();
    let id = c.crear();
    c.fondear(id, TOTAL);
    assert_eq!(
        del_contrato(&c),
        [ObraFondeada {
            obra: id,
            monto: TOTAL,
            fondeado: TOTAL
        }
        .to_xdr(&c.env, &c.id)]
    );
    // Tablero: obra, presupuesto, 4 hitos, saldo bloqueado.
    let o = c.client.ver_obra(&id);
    assert_eq!((o.monto_vigente, o.cantidad_hitos), (TOTAL, 4));
    assert_eq!(o.fondeado - o.pagado, TOTAL);
    assert_eq!(c.tok.balance(&c.id), TOTAL);

    // (a) Camino feliz del hito 1 (índice 0).
    let t0 = c.ahora();
    c.client.declarar_hito(&id, &0, &hash(&c.env, 1));
    assert_eq!(
        del_contrato(&c),
        [HitoDeclarado {
            obra: id,
            hito: 0,
            evidencia_hash: hash(&c.env, 1),
            fin_periodo: t0 + PERIODO
        }
        .to_xdr(&c.env, &c.id)]
    );
    c.aprobar_inspector(id, 0);
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
    assert_err!(c.client.try_liberar_pago(&id, &0), Error::PeriodoNoCumplido);
    c.ir_a(t0 + PERIODO);
    c.client.liberar_pago(&id, &0);
    assert_eq!(
        del_contrato(&c),
        [PagoLiberado {
            obra: id,
            hito: 0,
            contratista: c.contratista.clone(),
            monto: MONTOS[0],
            pagado: MONTOS[0]
        }
        .to_xdr(&c.env, &c.id)]
    );
    assert_eq!(c.tok.balance(&c.contratista), MONTOS[0]);
    assert_eq!(c.tok.balance(&c.id), TOTAL - MONTOS[0]);
    assert_eq!(c.hito(id, 0).estado, EstadoHito::Pagado);

    // (b) Trampa: el hito 3 (índice 2) sin el hito 2 (índice 1) aprobado.
    assert_err!(
        c.client.try_declarar_hito(&id, &2, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
    assert!(del_contrato(&c).events().is_empty());
    // Cobrar el índice 2 (Pendiente, con el 1 Pendiente): HitoAnteriorPendiente (§3.7 paso 4
    // antes que EstadoInvalido del paso 5).
    assert_err!(
        c.client.try_liberar_pago(&id, &2),
        Error::HitoAnteriorPendiente
    );
    assert!(del_contrato(&c).events().is_empty());
    assert_eq!(c.hito(id, 2).estado, EstadoHito::Pendiente);

    // (c) Objeción sobre el hito 2 (índice 1).
    let t1 = c.ahora();
    c.client.declarar_hito(&id, &1, &hash(&c.env, 2));
    assert_eq!(
        del_contrato(&c),
        [HitoDeclarado {
            obra: id,
            hito: 1,
            evidencia_hash: hash(&c.env, 2),
            fin_periodo: t1 + PERIODO
        }
        .to_xdr(&c.env, &c.id)]
    );
    c.aprobar_inspector(id, 1); // el inspector aprueba; el veedor, en lugar de aprobar, objeta
    c.avanzar(PERIODO / 2);
    c.client.objetar(&id, &1, &hash(&c.env, 9));
    assert_eq!(
        del_contrato(&c),
        [HitoObjetado {
            obra: id,
            hito: 1,
            motivo_hash: hash(&c.env, 9)
        }
        .to_xdr(&c.env, &c.id)]
    );
    assert_eq!(c.hito(id, 1).estado, EstadoHito::Objetado);

    // El pago queda congelado, aunque el período venza.
    c.ir_a(t1 + PERIODO * 2);
    assert_err!(c.client.try_liberar_pago(&id, &1), Error::ObjecionAbierta);
    assert!(del_contrato(&c).events().is_empty());
    assert_eq!(c.tok.balance(&c.contratista), MONTOS[0]);
    // Y el hito 3 (índice 2) sigue bloqueado.
    assert_err!(
        c.client.try_declarar_hito(&id, &2, &hash(&c.env, 1)),
        Error::HitoAnteriorPendiente
    );
    assert!(del_contrato(&c).events().is_empty());

    // Cierre: el árbitro rechaza la objeción -> el hito queda Aprobado -> se paga -> se destraba.
    c.resolver(id, 1, Decision::Rechazar);
    assert_eq!(
        del_contrato(&c),
        [ObjecionResuelta {
            obra: id,
            hito: 1,
            decision: Decision::Rechazar,
            estado: EstadoHito::Aprobado
        }
        .to_xdr(&c.env, &c.id)]
    );
    assert_eq!(c.hito(id, 1).estado, EstadoHito::Aprobado);
    // Ya venció el período original: se paga en el acto.
    c.client.liberar_pago(&id, &1);
    assert_eq!(
        del_contrato(&c),
        [PagoLiberado {
            obra: id,
            hito: 1,
            contratista: c.contratista.clone(),
            monto: MONTOS[1],
            pagado: MONTOS[0] + MONTOS[1]
        }
        .to_xdr(&c.env, &c.id)]
    );
    assert_eq!(c.tok.balance(&c.contratista), MONTOS[0] + MONTOS[1]);
    assert_eq!(c.tok.balance(&c.id), MONTOS[2] + MONTOS[3]);
    assert_eq!(c.client.ver_obra(&id).estado, EstadoObra::Activa);

    // El hito 3 (índice 2) ya se puede declarar.
    c.declarar(id, 2);
    assert_eq!(c.hito(id, 2).estado, EstadoHito::Evidencia);
}
