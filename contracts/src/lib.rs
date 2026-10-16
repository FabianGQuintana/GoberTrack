#![no_std]
//! Obra Pública Verificable: un contrato, muchas obras. Retiene los fondos de cada obra y los
//! libera por hitos, con aprobación de inspector y veedor y período de objeción.
//!
//! Interfaz: interfaces/contract.md v1.0. En cada función los pasos se evalúan en el orden de §3
//! y se devuelve el primer error que aplique. Primero se actualiza el estado y después se
//! transfiere el token (§0).
//!
//! Incluye todas las funciones del MVP (§3.1–3.8). `registrar_adenda` queda para la Fase 4.

mod almacen;
mod eventos;
mod tipos;

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, String, Vec};

pub use almacen::{Clave, EXTEND_TO, THRESHOLD};
pub use eventos::{
    HitoAprobado, HitoDeclarado, HitoObjetado, ObjecionResuelta, ObraCreada, ObraFondeada,
    PagoLiberado,
};
pub use tipos::{Decision, Error, EstadoHito, EstadoObra, Hito, NuevoHito, Obra};

use almacen::{
    cargar_hito, cargar_obra, extender_instancia, extender_obra, guardar_hito, guardar_obra,
    guardar_ultima_obra, ultima_obra,
};

#[contract]
pub struct ObraPublica;

#[contractimpl]
impl ObraPublica {
    /// §3.1. Crea una obra con sus hitos en `Pendiente`. Firma: el municipio.
    pub fn crear_obra(
        env: Env,
        municipio: Address,
        nombre: String,
        contratista: Address,
        inspector: Address,
        veedor: Address,
        arbitro: Address,
        token: Address,
        hitos: Vec<NuevoHito>,
        periodo_objecion: u64,
    ) -> Result<u32, Error> {
        municipio.require_auth();

        // Contratista, inspector, veedor y árbitro, distintos entre sí; el municipio, distinto de
        // contratista, inspector y veedor (sí puede ser el árbitro).
        let roles = [&contratista, &inspector, &veedor, &arbitro];
        for i in 0..roles.len() {
            for j in (i + 1)..roles.len() {
                if roles[i] == roles[j] {
                    return Err(Error::RolesDuplicados);
                }
            }
        }
        if municipio == contratista || municipio == inspector || municipio == veedor {
            return Err(Error::RolesDuplicados);
        }

        if hitos.is_empty() {
            return Err(Error::MontoInvalido);
        }
        let mut total: i128 = 0;
        for nuevo in hitos.iter() {
            if nuevo.monto <= 0 {
                return Err(Error::MontoInvalido);
            }
            total = total.checked_add(nuevo.monto).ok_or(Error::MontoInvalido)?;
        }

        let id = ultima_obra(&env)
            .checked_add(1)
            .expect("se agotaron los ids de obra");
        let ahora = env.ledger().timestamp();
        let obra = Obra {
            id,
            nombre: nombre.clone(),
            municipio: municipio.clone(),
            contratista: contratista.clone(),
            inspector: inspector.clone(),
            veedor: veedor.clone(),
            arbitro: arbitro.clone(),
            token: token.clone(),
            monto_original: total,
            monto_vigente: total,
            fondeado: 0,
            pagado: 0,
            periodo_objecion,
            cantidad_hitos: hitos.len(),
            estado: EstadoObra::Activa,
            creada_en: ahora,
        };
        for (indice, nuevo) in (0u32..).zip(hitos.iter()) {
            let hito = Hito {
                indice,
                descripcion: nuevo.descripcion,
                monto_original: nuevo.monto,
                monto_vigente: nuevo.monto,
                estado: EstadoHito::Pendiente,
                evidencia_hash: None,
                momento_declaracion: None,
                aprobo_inspector: false,
                aprobo_veedor: false,
                veedor_por_arbitro: false,
                objecion_usada: false,
                motivo_objecion_hash: None,
                momento_aprobacion_completa: None,
                momento_pago: None,
            };
            guardar_hito(&env, id, &hito);
        }
        guardar_obra(&env, &obra);
        guardar_ultima_obra(&env, id);
        extender_instancia(&env);

        ObraCreada {
            obra: id,
            nombre,
            municipio,
            contratista,
            inspector,
            veedor,
            arbitro,
            token,
            monto_original: total,
            cantidad_hitos: obra.cantidad_hitos,
            periodo_objecion,
        }
        .publish(&env);
        Ok(id)
    }

    /// §3.2. Deposita `monto` del municipio en el contrato. Acumulable hasta `monto_vigente`.
    pub fn fondear(env: Env, obra: u32, monto: i128) -> Result<(), Error> {
        let mut o = cargar_obra(&env, obra)?;
        o.municipio.require_auth();
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        // Si la suma desborda, seguro supera monto_vigente.
        let fondeado = o
            .fondeado
            .checked_add(monto)
            .filter(|f| *f <= o.monto_vigente)
            .ok_or(Error::ExcedeMontoTotal)?;

        o.fondeado = fondeado;
        guardar_obra(&env, &o);
        extender_instancia(&env);
        token::TokenClient::new(&env, &o.token).transfer(
            &o.municipio,
            &env.current_contract_address(),
            &monto,
        );

        ObraFondeada {
            obra,
            monto,
            fondeado,
        }
        .publish(&env);
        Ok(())
    }

    /// §3.3. El contratista declara el hito con el hash de la evidencia; arranca el período de
    /// objeción.
    pub fn declarar_hito(
        env: Env,
        obra: u32,
        hito: u32,
        evidencia_hash: BytesN<32>,
    ) -> Result<(), Error> {
        let o = cargar_obra(&env, obra)?;
        let mut h = cargar_hito(&env, &o, hito)?;
        o.contratista.require_auth();
        exigir_hito_anterior_ok(&env, &o, hito)?;
        if h.estado != EstadoHito::Pendiente {
            return Err(Error::EstadoInvalido);
        }

        let ahora = env.ledger().timestamp();
        h.estado = EstadoHito::Evidencia;
        h.evidencia_hash = Some(evidencia_hash.clone());
        h.momento_declaracion = Some(ahora);
        h.aprobo_inspector = false;
        h.aprobo_veedor = false;
        h.veedor_por_arbitro = false;
        h.objecion_usada = false;
        h.motivo_objecion_hash = None;
        h.momento_aprobacion_completa = None;
        guardar_hito(&env, obra, &h);
        extender_obra(&env, obra);
        extender_instancia(&env);

        HitoDeclarado {
            obra,
            hito,
            evidencia_hash,
            fin_periodo: fin_periodo(&o, &h),
        }
        .publish(&env);
        Ok(())
    }

    /// §3.4. Aprobación del inspector o del veedor (`firmante`). Con las dos, el hito queda
    /// `Aprobado`. Sin límite de tiempo.
    pub fn aprobar(env: Env, obra: u32, hito: u32, firmante: Address) -> Result<(), Error> {
        let o = cargar_obra(&env, obra)?;
        let mut h = cargar_hito(&env, &o, hito)?;
        let es_inspector = firmante == o.inspector;
        if !es_inspector && firmante != o.veedor {
            return Err(Error::NoAutorizado);
        }
        firmante.require_auth();
        exigir_hito_anterior_ok(&env, &o, hito)?;
        match h.estado {
            EstadoHito::Pagado => return Err(Error::YaPagado),
            EstadoHito::Objetado => return Err(Error::ObjecionAbierta),
            EstadoHito::Pendiente => return Err(Error::EstadoInvalido),
            EstadoHito::Evidencia | EstadoHito::Aprobado => {}
        }
        if (es_inspector && h.aprobo_inspector) || (!es_inspector && h.aprobo_veedor) {
            return Err(Error::YaDecidio);
        }

        if es_inspector {
            h.aprobo_inspector = true;
        } else {
            h.aprobo_veedor = true;
        }
        let completo = h.aprobo_inspector && h.aprobo_veedor;
        if completo {
            h.estado = EstadoHito::Aprobado;
            h.momento_aprobacion_completa = Some(env.ledger().timestamp());
        }
        guardar_hito(&env, obra, &h);
        extender_obra(&env, obra);
        extender_instancia(&env);

        HitoAprobado {
            obra,
            hito,
            firmante,
            completo,
        }
        .publish(&env);
        Ok(())
    }

    /// §3.5. El veedor objeta el hito, solo durante el período y si todavía no decidió en esta
    /// declaración. El hito queda congelado hasta que el árbitro resuelva.
    pub fn objetar(env: Env, obra: u32, hito: u32, motivo_hash: BytesN<32>) -> Result<(), Error> {
        let o = cargar_obra(&env, obra)?;
        let mut h = cargar_hito(&env, &o, hito)?;
        o.veedor.require_auth();
        match h.estado {
            EstadoHito::Pagado => return Err(Error::YaPagado),
            EstadoHito::Objetado => return Err(Error::ObjecionAbierta),
            EstadoHito::Pendiente => return Err(Error::EstadoInvalido),
            EstadoHito::Evidencia | EstadoHito::Aprobado => {}
        }
        if h.objecion_usada {
            return Err(Error::ObjecionYaUsada);
        }
        if h.aprobo_veedor {
            return Err(Error::YaDecidio);
        }
        if env.ledger().timestamp() >= fin_periodo(&o, &h) {
            return Err(Error::FueraDePeriodo);
        }

        h.estado = EstadoHito::Objetado;
        h.objecion_usada = true;
        h.motivo_objecion_hash = Some(motivo_hash.clone());
        guardar_hito(&env, obra, &h);
        extender_obra(&env, obra);
        extender_instancia(&env);

        HitoObjetado {
            obra,
            hito,
            motivo_hash,
        }
        .publish(&env);
        Ok(())
    }

    /// §3.6. El árbitro resuelve una objeción abierta. `Aceptar`: el hito vuelve a `Pendiente`
    /// para una re-declaración. `Rechazar`: cuenta como aprobación del veedor.
    pub fn resolver_objecion(
        env: Env,
        obra: u32,
        hito: u32,
        decision: Decision,
    ) -> Result<(), Error> {
        let o = cargar_obra(&env, obra)?;
        let mut h = cargar_hito(&env, &o, hito)?;
        o.arbitro.require_auth();
        if h.estado != EstadoHito::Objetado {
            return Err(Error::EstadoInvalido);
        }

        match decision {
            Decision::Aceptar => {
                // La nueva declaración abre un período nuevo con una objeción disponible.
                h.estado = EstadoHito::Pendiente;
                h.aprobo_inspector = false;
                h.aprobo_veedor = false;
                h.veedor_por_arbitro = false;
                h.momento_aprobacion_completa = None;
                h.evidencia_hash = None;
                h.momento_declaracion = None;
                h.objecion_usada = false;
                h.motivo_objecion_hash = None;
            }
            Decision::Rechazar => {
                // `objecion_usada` sigue en true: el veedor no puede volver a objetar.
                h.aprobo_veedor = true;
                h.veedor_por_arbitro = true;
                if h.aprobo_inspector {
                    h.estado = EstadoHito::Aprobado;
                    h.momento_aprobacion_completa = Some(env.ledger().timestamp());
                } else {
                    h.estado = EstadoHito::Evidencia;
                }
            }
        }
        guardar_hito(&env, obra, &h);
        extender_obra(&env, obra);
        extender_instancia(&env);

        ObjecionResuelta {
            obra,
            hito,
            decision,
            estado: h.estado,
        }
        .publish(&env);
        Ok(())
    }

    /// §3.7. Paga el hito al contratista. Sin firma: cualquiera la puede llamar.
    pub fn liberar_pago(env: Env, obra: u32, hito: u32) -> Result<(), Error> {
        let mut o = cargar_obra(&env, obra)?;
        let mut h = cargar_hito(&env, &o, hito)?;
        match h.estado {
            EstadoHito::Pagado => return Err(Error::YaPagado),
            EstadoHito::Objetado => return Err(Error::ObjecionAbierta),
            _ => {}
        }
        exigir_hito_anterior_ok(&env, &o, hito)?;
        if h.estado != EstadoHito::Aprobado {
            return Err(Error::EstadoInvalido);
        }
        let ahora = env.ledger().timestamp();
        if ahora < fin_periodo(&o, &h) {
            return Err(Error::PeriodoNoCumplido);
        }
        if o.fondeado - o.pagado < h.monto_vigente {
            return Err(Error::FondosInsuficientes);
        }

        h.estado = EstadoHito::Pagado;
        h.momento_pago = Some(ahora);
        o.pagado += h.monto_vigente;
        guardar_hito(&env, obra, &h);
        if todos_pagados(&env, &o, hito)? {
            o.estado = EstadoObra::Finalizada;
        }
        guardar_obra(&env, &o);
        extender_instancia(&env);
        token::TokenClient::new(&env, &o.token).transfer(
            &env.current_contract_address(),
            &o.contratista,
            &h.monto_vigente,
        );

        PagoLiberado {
            obra,
            hito,
            contratista: o.contratista,
            monto: h.monto_vigente,
            pagado: o.pagado,
        }
        .publish(&env);
        Ok(())
    }

    /// §3.8. Obra completa.
    pub fn ver_obra(env: Env, obra: u32) -> Result<Obra, Error> {
        cargar_obra(&env, obra)
    }

    /// §3.8. Un hito de la obra.
    pub fn ver_hito(env: Env, obra: u32, hito: u32) -> Result<Hito, Error> {
        let o = cargar_obra(&env, obra)?;
        cargar_hito(&env, &o, hito)
    }

    /// §3.8. Todos los hitos de la obra, en orden (para que el indexador reconstruya el estado).
    pub fn ver_hitos(env: Env, obra: u32) -> Result<Vec<Hito>, Error> {
        let o = cargar_obra(&env, obra)?;
        let mut hitos = Vec::new(&env);
        for indice in 0..o.cantidad_hitos {
            hitos.push_back(cargar_hito(&env, &o, indice)?);
        }
        Ok(hitos)
    }

    /// §3.8. Último id de obra asignado (0 si no hay obras).
    pub fn cantidad_obras(env: Env) -> u32 {
        ultima_obra(&env)
    }
}

/// "Hito anterior OK" (§3): `hito == 0`, o el hito `hito − 1` está `Aprobado` o `Pagado`.
fn exigir_hito_anterior_ok(env: &Env, obra: &Obra, hito: u32) -> Result<(), Error> {
    if hito == 0 {
        return Ok(());
    }
    match cargar_hito(env, obra, hito - 1)?.estado {
        EstadoHito::Aprobado | EstadoHito::Pagado => Ok(()),
        _ => Err(Error::HitoAnteriorPendiente),
    }
}

/// Fin del período de objeción: `momento_declaracion + periodo_objecion`. Satura en vez de
/// desbordar, para que un período enorme no bloquee la declaración. Sin declaración vigente
/// devuelve el máximo, así que nunca habilita un pago.
fn fin_periodo(obra: &Obra, hito: &Hito) -> u64 {
    hito.momento_declaracion
        .map_or(u64::MAX, |m| m.saturating_add(obra.periodo_objecion))
}

/// Si todos los hitos quedaron pagados, sabiendo que `pagado_ahora` se acaba de pagar.
/// `pagado == monto_vigente` es condición necesaria (invariante 4 del PRD), así que solo se
/// recorren los hitos en el último pago.
fn todos_pagados(env: &Env, obra: &Obra, pagado_ahora: u32) -> Result<bool, Error> {
    if obra.pagado != obra.monto_vigente {
        return Ok(false);
    }
    for indice in 0..obra.cantidad_hitos {
        if indice != pagado_ahora && cargar_hito(env, obra, indice)?.estado != EstadoHito::Pagado {
            return Ok(false);
        }
    }
    Ok(true)
}

#[cfg(test)]
mod test;
