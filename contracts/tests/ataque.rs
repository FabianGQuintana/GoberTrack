//! Pruebas de ataque de A-REVISOR (PRD §8, §12 y §15; interfaces/contract.md v1.0).
//!
//! No repiten las pruebas unitarias de `src/test/`: buscan romper los invariantes del PRD §8 desde
//! afuera, como lo haría alguien con mala intención.
//!
//! 1. **Tokens hostiles.** El municipio elige `token` al crear la obra y el contrato no lo valida,
//!    así que puede ser un contrato cualquiera. Se prueban reentrada, robo de fondos reales de
//!    otras obras, un token que no mueve nada, uno que falla al pagar, el propio contrato como
//!    token y uno con comisión por transferencia.
//! 2. **Roles y firmas cruzadas entre obras**, con firmas reales (sin `mock_all_auths`).
//! 3. **Fuzz diferencial.** Secuencias pseudoaleatorias de llamadas contra un modelo escrito a
//!    partir de contract.md §3 (no del código): se comparan el resultado de cada llamada, el
//!    estado completo de obras e hitos, los saldos de los tokens y los eventos, y se verifican
//!    los invariantes del PRD §8 después de cada paso.
//!
//! Al ser una prueba de integración, `cargo test` compila también el `cdylib` nativo del crate
//! con `testutils`. En Windows con MinGW (`x86_64-pc-windows-gnu`) ese DLL supera el límite de
//! 65 535 exports y el link falla ("export ordinal too large"). Hasta que `contracts/` tenga la
//! configuración que lo evita, se corre así:
//!
//! ```console
//! cargo test --config 'target.x86_64-pc-windows-gnu.rustflags=["-C","link-arg=-Wl,--exclude-all-symbols"]'
//! ```

use std::collections::BTreeSet;

use obra_publica::{
    Decision, Error, EstadoHito, EstadoObra, Hito, NuevoHito, Obra, ObraPublica, ObraPublicaClient,
};
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    xdr, Address, BytesN, ConversionError, Env, IntoVal, InvokeError, MuxedAddress, String,
    Vec as SVec,
};

// ---------------------------------------------------------------------------------------------
// Preparación
// ---------------------------------------------------------------------------------------------

const T0: u64 = 10_000;

/// Lo que devuelve un `try_<fn>` del cliente generado.
type Intento<T> = Result<Result<T, ConversionError>, Result<Error, InvokeError>>;

/// Error del contrato o éxito. Un error del host (firma, token, reentrada) hace fallar la prueba.
fn resultado<T>(r: Intento<T>) -> Result<T, Error> {
    match r {
        Ok(Ok(v)) => Ok(v),
        Err(Ok(e)) => Err(e),
        Ok(Err(e)) => panic!("error de conversión: {:?}", e),
        Err(Err(e)) => panic!("error del host: {:?}", e),
    }
}

/// Verdadero si la llamada falló con un error del host (no del contrato).
fn es_error_del_host<T>(r: &Intento<T>) -> bool {
    matches!(r, Err(Err(_)))
}

fn texto(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

fn hash(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn hitos(env: &Env, montos: &[i128]) -> SVec<NuevoHito> {
    let mut v = SVec::new(env);
    for (i, m) in montos.iter().enumerate() {
        v.push_back(NuevoHito {
            descripcion: texto(env, &format!("hito {}", i)),
            monto: *m,
        });
    }
    v
}

struct Roles {
    municipio: Address,
    contratista: Address,
    inspector: Address,
    veedor: Address,
    arbitro: Address,
}

impl Roles {
    fn nuevos(env: &Env) -> Roles {
        Roles {
            municipio: Address::generate(env),
            contratista: Address::generate(env),
            inspector: Address::generate(env),
            veedor: Address::generate(env),
            arbitro: Address::generate(env),
        }
    }
}

struct Esc {
    env: Env,
    id: Address,
    cli: ObraPublicaClient<'static>,
    /// SAC "real" compartido por las obras víctimas.
    sac: Address,
}

/// Entorno con firmas mockeadas, timestamp `T0`, el contrato y un SAC. Sin obras.
fn escenario() -> Esc {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);
    let id = env.register(ObraPublica, ());
    let cli = ObraPublicaClient::new(&env, &id);
    let sac = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    Esc { env, id, cli, sac }
}

impl Esc {
    fn crear(&self, r: &Roles, token: &Address, montos: &[i128], periodo: u64) -> u32 {
        self.cli.crear_obra(
            &r.municipio,
            &texto(&self.env, "obra"),
            &r.contratista,
            &r.inspector,
            &r.veedor,
            &r.arbitro,
            token,
            &hitos(&self.env, montos),
            &periodo,
        )
    }

    fn emitir_sac(&self, a: &Address, monto: i128) {
        StellarAssetClient::new(&self.env, &self.sac).mint(a, &monto);
    }

    fn saldo_sac(&self, a: &Address) -> i128 {
        TokenClient::new(&self.env, &self.sac).balance(a)
    }

    /// Declara y aprueba (inspector y veedor) el hito. Firmas mockeadas.
    fn aprobar_hito(&self, r: &Roles, obra: u32, hito: u32) {
        self.env.mock_all_auths();
        self.cli.declarar_hito(&obra, &hito, &hash(&self.env, 1));
        self.cli.aprobar(&obra, &hito, &r.inspector);
        self.cli.aprobar(&obra, &hito, &r.veedor);
    }

    fn avanzar(&self, segundos: u64) {
        let t = self.env.ledger().timestamp();
        self.env.ledger().set_timestamp(t + segundos);
    }

    /// Obra víctima con el SAC real: 4 hitos, total 1000, fondeada por completo.
    fn obra_victima(&self) -> (Roles, u32) {
        let r = Roles::nuevos(&self.env);
        self.emitir_sac(&r.municipio, 1_000);
        let id = self.crear(&r, &self.sac, &[100, 200, 300, 400], 10);
        self.cli.fondear(&id, &1_000);
        (r, id)
    }

    /// Lleva la obra víctima hasta el final y verifica que el contratista cobre el total.
    fn pagar_victima_completa(&self, r: &Roles, obra: u32) {
        for h in 0..4 {
            self.aprobar_hito(r, obra, h);
            self.avanzar(10);
            self.cli.liberar_pago(&obra, &h);
        }
        assert_eq!(self.saldo_sac(&r.contratista), 1_000);
        assert_eq!(self.cli.ver_obra(&obra).estado, EstadoObra::Finalizada);
    }

    /// Eventos del contrato (no del token) en la última invocación.
    fn eventos(&self) -> std::vec::Vec<xdr::ContractEvent> {
        self.env
            .events()
            .all()
            .filter_by_contract(&self.id)
            .events()
            .to_vec()
    }
}

// ---------------------------------------------------------------------------------------------
// 1. Tokens hostiles
// ---------------------------------------------------------------------------------------------

mod token_reentrante {
    use super::*;

    /// Cada transferencia intenta volver a entrar al contrato: cobrar otra vez, fondear y leer.
    #[contract]
    pub struct TokenReentrante;

    #[contractimpl]
    impl TokenReentrante {
        pub fn configurar(env: Env, objetivo: Address, obra: u32, hito: u32) {
            let s = env.storage().instance();
            s.set(&symbol_short!("objetivo"), &objetivo);
            s.set(&symbol_short!("obra"), &obra);
            s.set(&symbol_short!("hito"), &hito);
        }

        pub fn transfer(env: Env, _from: Address, _to: MuxedAddress, _amount: i128) {
            let s = env.storage().instance();
            let objetivo: Address = s.get(&symbol_short!("objetivo")).unwrap();
            let obra: u32 = s.get(&symbol_short!("obra")).unwrap();
            let hito: u32 = s.get(&symbol_short!("hito")).unwrap();
            let cli = ObraPublicaClient::new(&env, &objetivo);
            let exitos = [
                matches!(cli.try_liberar_pago(&obra, &hito), Ok(Ok(()))),
                matches!(cli.try_fondear(&obra, &1), Ok(Ok(()))),
                matches!(cli.try_ver_obra(&obra), Ok(Ok(_))),
            ]
            .iter()
            .filter(|e| **e)
            .count() as u32;
            let intentos: u32 = s.get(&symbol_short!("intentos")).unwrap_or(0);
            let previos: u32 = s.get(&symbol_short!("exitos")).unwrap_or(0);
            s.set(&symbol_short!("intentos"), &(intentos + 3));
            s.set(&symbol_short!("exitos"), &(previos + exitos));
        }

        pub fn intentos(env: Env) -> u32 {
            env.storage()
                .instance()
                .get(&symbol_short!("intentos"))
                .unwrap_or(0)
        }

        pub fn exitos(env: Env) -> u32 {
            env.storage()
                .instance()
                .get(&symbol_short!("exitos"))
                .unwrap_or(0)
        }
    }
}

mod token_ladron {
    use super::*;

    /// Cada vez que el contrato lo llama, intenta mover todo el saldo del SAC real que tiene el
    /// contrato (fondos de otras obras) hacia el ladrón, usando que el contrato lo invocó.
    #[contract]
    pub struct TokenLadron;

    #[contractimpl]
    impl TokenLadron {
        pub fn configurar(env: Env, objetivo: Address, real: Address, ladron: Address) {
            let s = env.storage().instance();
            s.set(&symbol_short!("objetivo"), &objetivo);
            s.set(&symbol_short!("real"), &real);
            s.set(&symbol_short!("ladron"), &ladron);
        }

        pub fn transfer(env: Env, _from: Address, _to: MuxedAddress, _amount: i128) {
            let s = env.storage().instance();
            let objetivo: Address = s.get(&symbol_short!("objetivo")).unwrap();
            let real: Address = s.get(&symbol_short!("real")).unwrap();
            let ladron: Address = s.get(&symbol_short!("ladron")).unwrap();
            let sac = TokenClient::new(&env, &real);
            let botin = sac.balance(&objetivo);
            let robo = sac.try_transfer(&objetivo, &ladron, &botin);
            let intentos: u32 = s.get(&symbol_short!("intentos")).unwrap_or(0);
            let exitos: u32 = s.get(&symbol_short!("exitos")).unwrap_or(0);
            s.set(&symbol_short!("intentos"), &(intentos + 1));
            if matches!(robo, Ok(Ok(()))) {
                s.set(&symbol_short!("exitos"), &(exitos + 1));
            }
        }

        pub fn intentos(env: Env) -> u32 {
            env.storage()
                .instance()
                .get(&symbol_short!("intentos"))
                .unwrap_or(0)
        }

        pub fn exitos(env: Env) -> u32 {
            env.storage()
                .instance()
                .get(&symbol_short!("exitos"))
                .unwrap_or(0)
        }
    }
}

mod token_mudo {
    use super::*;

    /// `transfer` no hace nada: ni cobra al municipio ni paga al contratista.
    #[contract]
    pub struct TokenMudo;

    #[contractimpl]
    impl TokenMudo {
        pub fn transfer(_env: Env, _from: Address, _to: MuxedAddress, _amount: i128) {}
    }
}

mod token_que_falla {
    use super::*;

    /// Acepta depósitos pero se niega a toda transferencia que salga del contrato.
    #[contract]
    pub struct TokenQueFalla;

    #[contractimpl]
    impl TokenQueFalla {
        pub fn configurar(env: Env, objetivo: Address) {
            env.storage()
                .instance()
                .set(&symbol_short!("objetivo"), &objetivo);
        }

        pub fn transfer(env: Env, from: Address, _to: MuxedAddress, _amount: i128) {
            let objetivo: Address = env
                .storage()
                .instance()
                .get(&symbol_short!("objetivo"))
                .unwrap();
            if from == objetivo {
                panic!("el token se niega a pagar");
            }
        }
    }
}

mod token_con_comision {
    use super::*;

    /// Token "deflacionario": cada transferencia quema el 10 % de lo enviado. Quien recibe obtiene
    /// `amount - amount / 10`.
    #[contract]
    pub struct TokenConComision;

    fn clave(a: &Address) -> (soroban_sdk::Symbol, Address) {
        (symbol_short!("saldo"), a.clone())
    }

    #[contractimpl]
    impl TokenConComision {
        pub fn emitir(env: Env, a: Address, monto: i128) {
            let s = env.storage().instance();
            let previo: i128 = s.get(&clave(&a)).unwrap_or(0);
            s.set(&clave(&a), &(previo + monto));
        }

        pub fn balance(env: Env, id: Address) -> i128 {
            env.storage().instance().get(&clave(&id)).unwrap_or(0)
        }

        pub fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
            from.require_auth();
            let to = to.address();
            let s = env.storage().instance();
            let de: i128 = s.get(&clave(&from)).unwrap_or(0);
            if de < amount {
                panic!("saldo insuficiente");
            }
            s.set(&clave(&from), &(de - amount));
            let a: i128 = s.get(&clave(&to)).unwrap_or(0);
            s.set(&clave(&to), &(a + amount - amount / 10));
        }
    }
}

use token_con_comision::{TokenConComision, TokenConComisionClient};
use token_ladron::{TokenLadron, TokenLadronClient};
use token_mudo::TokenMudo;
use token_que_falla::{TokenQueFalla, TokenQueFallaClient};
use token_reentrante::{TokenReentrante, TokenReentranteClient};

#[test]
fn token_hostil_no_puede_reentrar_ni_cobrar_dos_veces() {
    let e = escenario();
    let r = Roles::nuevos(&e.env);
    let h = e.env.register(TokenReentrante, ());
    let obra = e.crear(&r, &h, &[100, 200], 0);
    TokenReentranteClient::new(&e.env, &h).configurar(&e.id, &obra, &0);

    // Fondear: el token intenta reentrar mientras el contrato le pide el depósito.
    e.cli.fondear(&obra, &300);
    // Pagar el hito 0: el token intenta cobrarlo otra vez desde adentro de la transferencia.
    e.aprobar_hito(&r, obra, 0);
    e.cli.liberar_pago(&obra, &0);

    let tok = TokenReentranteClient::new(&e.env, &h);
    assert_eq!(tok.intentos(), 6, "el token hostil sí intentó reentrar");
    assert_eq!(
        tok.exitos(),
        0,
        "ninguna reentrada, ni siquiera una lectura"
    );
    let o = e.cli.ver_obra(&obra);
    assert_eq!(
        (o.fondeado, o.pagado),
        (300, 100),
        "sin fondeo ni pago doble"
    );
    assert_eq!(e.cli.ver_hito(&obra, &0).estado, EstadoHito::Pagado);
    assert_eq!(e.cli.ver_hito(&obra, &1).estado, EstadoHito::Pendiente);
}

#[test]
fn token_hostil_no_puede_sacar_fondos_reales_de_otras_obras() {
    let e = escenario();
    let (rv, victima) = e.obra_victima();
    assert_eq!(e.saldo_sac(&e.id), 1_000);

    // El atacante controla todos los roles de su obra y elige un token propio.
    let ra = Roles::nuevos(&e.env);
    let ladron = Address::generate(&e.env);
    let h = e.env.register(TokenLadron, ());
    TokenLadronClient::new(&e.env, &h).configurar(&e.id, &e.sac, &ladron);
    let obra = e.crear(&ra, &h, &[1_000], 0);

    // Fondear con firmas reales: el municipio atacante firma solo su `fondear`.
    e.env.mock_auths(&[MockAuth {
        address: &ra.municipio,
        invoke: &MockAuthInvoke {
            contract: &e.id,
            fn_name: "fondear",
            args: (obra, 1_000i128).into_val(&e.env),
            sub_invokes: &[],
        },
    }]);
    e.cli.fondear(&obra, &1_000);

    // Pagar sin ninguna firma: `liberar_pago` no la pide y así se ejercita la regla real.
    e.aprobar_hito(&ra, obra, 0);
    e.env.set_auths(&[]);
    e.cli.liberar_pago(&obra, &0);

    let tok = TokenLadronClient::new(&e.env, &h);
    assert_eq!(tok.intentos(), 2, "intentó robar al fondear y al pagar");
    assert_eq!(tok.exitos(), 0);
    assert_eq!(e.saldo_sac(&ladron), 0);
    assert_eq!(
        e.saldo_sac(&e.id),
        1_000,
        "los fondos de la víctima siguen ahí"
    );

    // La víctima cobra todo.
    e.pagar_victima_completa(&rv, victima);
    assert_eq!(e.saldo_sac(&e.id), 0);
}

/// Control de la prueba anterior: sin la regla de autorización del invocador (firmas mockeadas
/// también en llamadas internas) el mismo token sí roba. Demuestra que el ataque es real y que lo
/// que lo frena es que el contrato nunca autoriza llamadas de terceros en su nombre (no usa
/// `authorize_as_current_contract`). Si algún día lo usa, este es el ataque a repetir.
#[test]
fn control_sin_la_regla_del_invocador_el_token_ladron_si_roba() {
    let e = escenario();
    let _ = e.obra_victima();
    let ra = Roles::nuevos(&e.env);
    let ladron = Address::generate(&e.env);
    let h = e.env.register(TokenLadron, ());
    TokenLadronClient::new(&e.env, &h).configurar(&e.id, &e.sac, &ladron);
    let obra = e.crear(&ra, &h, &[1_000], 0);

    e.env.mock_all_auths_allowing_non_root_auth();
    e.cli.fondear(&obra, &1_000);
    assert_eq!(e.saldo_sac(&ladron), 1_000);
}

#[test]
fn token_mudo_solo_afecta_a_su_propia_obra() {
    let e = escenario();
    let (rv, victima) = e.obra_victima();

    let ra = Roles::nuevos(&e.env);
    let h = e.env.register(TokenMudo, ());
    let obra = e.crear(&ra, &h, &[600, 400], 0);
    e.cli.fondear(&obra, &1_000); // no entra nada, pero queda registrado
    for hito in 0..2 {
        e.aprobar_hito(&ra, obra, hito);
        e.cli.liberar_pago(&obra, &hito);
    }
    // La obra con token falso figura pagada y finalizada, pero no movió fondos reales.
    let o = e.cli.ver_obra(&obra);
    assert_eq!((o.pagado, o.estado), (1_000, EstadoObra::Finalizada));
    assert_eq!(e.saldo_sac(&e.id), 1_000);
    assert_eq!(e.saldo_sac(&ra.contratista), 0);

    e.pagar_victima_completa(&rv, victima);
}

#[test]
fn token_que_falla_al_pagar_revierte_todo_el_pago() {
    let e = escenario();
    let r = Roles::nuevos(&e.env);
    let h = e.env.register(TokenQueFalla, ());
    TokenQueFallaClient::new(&e.env, &h).configurar(&e.id);
    let obra = e.crear(&r, &h, &[100, 200], 0);
    e.cli.fondear(&obra, &300);
    e.aprobar_hito(&r, obra, 0);

    let antes_obra = e.cli.ver_obra(&obra);
    let antes_hito = e.cli.ver_hito(&obra, &0);
    let r1 = e.cli.try_liberar_pago(&obra, &0);
    assert!(es_error_del_host(&r1), "{:?}", r1);
    assert!(e.eventos().is_empty(), "un pago fallido no deja eventos");
    // El estado se escribió antes de la transferencia (§0), pero la invocación entera se revierte.
    assert_eq!(e.cli.ver_obra(&obra), antes_obra);
    assert_eq!(e.cli.ver_hito(&obra, &0), antes_hito);
    assert_eq!(antes_hito.estado, EstadoHito::Aprobado);
    // Se puede reintentar (sigue fallando) sin quedar en un estado intermedio.
    assert!(es_error_del_host(&e.cli.try_liberar_pago(&obra, &0)));
    assert_eq!(e.cli.ver_obra(&obra).pagado, 0);
}

#[test]
fn el_propio_contrato_como_token_deja_la_obra_sin_fondear() {
    let e = escenario();
    let r = Roles::nuevos(&e.env);
    // `crear_obra` no valida el token (contract.md no lo pide).
    let obra = e.crear(&r, &e.id.clone(), &[100], 0);
    let res = e.cli.try_fondear(&obra, &100);
    assert!(es_error_del_host(&res), "{:?}", res);
    assert_eq!(e.cli.ver_obra(&obra).fondeado, 0);
}

/// contract.md §1: "Los fondos de cada obra están separados: un pago solo usa el saldo de su
/// obra". El contrato suma a `fondeado` el monto pedido, no lo que efectivamente llegó. Con un
/// token que cobra comisión, dos obras que lo comparten mezclan saldos: la primera en cobrar se
/// lleva fondos de la segunda, que después no puede cobrar aunque su saldo contable alcance.
/// Solo afecta a obras cuyo municipio eligió un token no estándar (un SAC nunca cobra comisión).
#[test]
#[ignore = "BUG (bajo, requiere un token no estándar): con un token con comisión el pago de una \
            obra usa fondos de otra que comparte el token; contract.md §1 dice que los fondos \
            están separados"]
fn token_con_comision_no_mezcla_saldos_entre_obras() {
    let e = escenario();
    let h = e.env.register(TokenConComision, ());
    let tok = TokenConComisionClient::new(&e.env, &h);
    let (ra, rb) = (Roles::nuevos(&e.env), Roles::nuevos(&e.env));
    tok.emitir(&ra.municipio, &100);
    tok.emitir(&rb.municipio, &100);
    let a = e.crear(&ra, &h, &[100], 0);
    let b = e.crear(&rb, &h, &[100], 0);
    e.cli.fondear(&a, &100);
    e.cli.fondear(&b, &100);
    // Contablemente cada obra tiene 100, pero al contrato llegaron 90 + 90.
    assert_eq!(tok.balance(&e.id), 180);

    e.aprobar_hito(&ra, a, 0);
    e.cli.liberar_pago(&a, &0);
    // La obra A sacó 100: 90 eran suyos y 10 de la obra B.
    assert_eq!(tok.balance(&e.id), 80);
    let o = e.cli.ver_obra(&b);
    assert_eq!(
        o.fondeado - o.pagado,
        100,
        "el contrato cree que B tiene 100"
    );

    e.aprobar_hito(&rb, b, 0);
    let res = e.cli.try_liberar_pago(&b, &0);
    assert_eq!(
        res,
        Ok(Ok(())),
        "B no puede cobrar: A usó parte de sus fondos"
    );
}

// ---------------------------------------------------------------------------------------------
// 2. Roles y firmas cruzadas entre obras (firmas reales)
// ---------------------------------------------------------------------------------------------

/// Deja una sola firma mockeada: `quien` autoriza `fn_name(args)` sobre el contrato.
fn solo_firma(e: &Esc, quien: &Address, fn_name: &str, args: SVec<soroban_sdk::Val>) {
    e.env.mock_auths(&[MockAuth {
        address: quien,
        invoke: &MockAuthInvoke {
            contract: &e.id,
            fn_name,
            args,
            sub_invokes: &[],
        },
    }]);
}

#[test]
fn los_roles_de_una_obra_no_sirven_en_otra() {
    let e = escenario();
    let (ra, rb) = (Roles::nuevos(&e.env), Roles::nuevos(&e.env));
    e.emitir_sac(&ra.municipio, 1_000);
    e.emitir_sac(&rb.municipio, 1_000);
    let _a = e.crear(&ra, &e.sac, &[100, 200], 100);
    let b = e.crear(&rb, &e.sac, &[100, 200], 100);
    let ev = hash(&e.env, 7);

    // El contratista de A firma una declaración en B.
    solo_firma(
        &e,
        &ra.contratista,
        "declarar_hito",
        (b, 0u32, ev.clone()).into_val(&e.env),
    );
    assert!(es_error_del_host(&e.cli.try_declarar_hito(&b, &0, &ev)));
    assert_eq!(e.cli.ver_hito(&b, &0).estado, EstadoHito::Pendiente);

    e.env.mock_all_auths();
    e.cli.declarar_hito(&b, &0, &ev);

    // El inspector de A se presenta como firmante en B: NoAutorizado, aun con su firma.
    solo_firma(
        &e,
        &ra.inspector,
        "aprobar",
        (b, 0u32, ra.inspector.clone()).into_val(&e.env),
    );
    assert_eq!(
        resultado(e.cli.try_aprobar(&b, &0, &ra.inspector)),
        Err(Error::NoAutorizado)
    );
    // ... o firma en nombre del inspector de B: error del host.
    solo_firma(
        &e,
        &ra.inspector,
        "aprobar",
        (b, 0u32, rb.inspector.clone()).into_val(&e.env),
    );
    assert!(es_error_del_host(&e.cli.try_aprobar(&b, &0, &rb.inspector)));

    // El veedor de A objeta en B.
    let m = hash(&e.env, 9);
    solo_firma(
        &e,
        &ra.veedor,
        "objetar",
        (b, 0u32, m.clone()).into_val(&e.env),
    );
    assert!(es_error_del_host(&e.cli.try_objetar(&b, &0, &m)));
    assert_eq!(e.cli.ver_hito(&b, &0).estado, EstadoHito::Evidencia);

    // El árbitro de A resuelve una objeción de B.
    e.env.mock_all_auths();
    e.cli.objetar(&b, &0, &m);
    solo_firma(
        &e,
        &ra.arbitro,
        "resolver_objecion",
        (b, 0u32, Decision::Rechazar).into_val(&e.env),
    );
    assert!(es_error_del_host(&e.cli.try_resolver_objecion(
        &b,
        &0,
        &Decision::Rechazar
    )));
    assert_eq!(e.cli.ver_hito(&b, &0).estado, EstadoHito::Objetado);

    // El municipio de A fondea B (con su propio dinero): tampoco.
    solo_firma(&e, &ra.municipio, "fondear", (b, 100i128).into_val(&e.env));
    assert!(es_error_del_host(&e.cli.try_fondear(&b, &100)));
    assert_eq!(e.cli.ver_obra(&b).fondeado, 0);
    assert_eq!(e.saldo_sac(&ra.municipio), 1_000);
}

#[test]
fn la_firma_de_fondear_no_sirve_para_otra_obra_ni_otro_monto() {
    let e = escenario();
    // El mismo municipio en dos obras.
    let ra = Roles::nuevos(&e.env);
    let mut rb = Roles::nuevos(&e.env);
    rb.municipio = ra.municipio.clone();
    e.emitir_sac(&ra.municipio, 10_000);
    let a = e.crear(&ra, &e.sac, &[1_000], 0);
    let b = e.crear(&rb, &e.sac, &[1_000], 0);

    let firma_fondear_a_100 = |e: &Esc| {
        e.env.mock_auths(&[MockAuth {
            address: &ra.municipio,
            invoke: &MockAuthInvoke {
                contract: &e.id,
                fn_name: "fondear",
                args: (a, 100i128).into_val(&e.env),
                sub_invokes: &[MockAuthInvoke {
                    contract: &e.sac,
                    fn_name: "transfer",
                    args: (ra.municipio.clone(), e.id.clone(), 100i128).into_val(&e.env),
                    sub_invokes: &[],
                }],
            },
        }]);
    };

    firma_fondear_a_100(&e);
    assert!(es_error_del_host(&e.cli.try_fondear(&b, &100)));
    firma_fondear_a_100(&e);
    assert!(es_error_del_host(&e.cli.try_fondear(&a, &1_000)));
    assert_eq!(e.saldo_sac(&ra.municipio), 10_000);
    // Control: con la firma correcta sí fondea.
    firma_fondear_a_100(&e);
    assert_eq!(resultado(e.cli.try_fondear(&a, &100)), Ok(()));
    assert_eq!(e.saldo_sac(&ra.municipio), 9_900);
    assert_eq!(
        (e.cli.ver_obra(&a).fondeado, e.cli.ver_obra(&b).fondeado),
        (100, 0)
    );
}

// ---------------------------------------------------------------------------------------------
// 3. Fuzz diferencial contra un modelo de contract.md §3
// ---------------------------------------------------------------------------------------------

/// xorshift64*: determinista, sin dependencias.
struct Rng(u64);

impl Rng {
    fn nuevo(semilla: u64) -> Rng {
        Rng(semilla.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)
    }

    fn sig(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    fn menor(&mut self, n: u64) -> u64 {
        self.sig() % n
    }

    fn uno<T: Copy>(&mut self, xs: &[T]) -> T {
        xs[self.menor(xs.len() as u64) as usize]
    }
}

/// Modelo de un hito, escrito desde contract.md §1 y §3.
#[derive(Clone, Debug)]
struct MHito {
    monto: i128,
    estado: EstadoHito,
    insp: bool,
    veed: bool,
    por_arbitro: bool,
    objecion_usada: bool,
    evidencia: Option<u8>,
    declaracion: Option<u64>,
    motivo: Option<u8>,
    completa: Option<u64>,
    pago: Option<u64>,
}

/// Modelo de una obra. Los roles son índices en el conjunto de direcciones del fuzz:
/// `[municipio, contratista, inspector, veedor, arbitro]`.
struct MObra {
    roles: [usize; 5],
    token: usize,
    total: i128,
    fondeado: i128,
    pagado: i128,
    periodo: u64,
    hitos: std::vec::Vec<MHito>,
    finalizada: bool,
}

const MUNICIPIO: usize = 0;
const CONTRATISTA: usize = 1;
const INSPECTOR: usize = 2;
const VEEDOR: usize = 3;

impl MObra {
    fn nueva(roles: [usize; 5], token: usize, montos: &[i128], periodo: u64) -> MObra {
        MObra {
            roles,
            token,
            total: montos.iter().sum(),
            fondeado: 0,
            pagado: 0,
            periodo,
            hitos: montos
                .iter()
                .map(|m| MHito {
                    monto: *m,
                    estado: EstadoHito::Pendiente,
                    insp: false,
                    veed: false,
                    por_arbitro: false,
                    objecion_usada: false,
                    evidencia: None,
                    declaracion: None,
                    motivo: None,
                    completa: None,
                    pago: None,
                })
                .collect(),
            finalizada: false,
        }
    }

    fn hito(&self, h: u32) -> Result<usize, Error> {
        if (h as usize) < self.hitos.len() {
            Ok(h as usize)
        } else {
            Err(Error::HitoNoExiste)
        }
    }

    /// "Hito anterior OK" de §3.
    fn anterior_ok(&self, h: usize) -> Result<(), Error> {
        if h == 0
            || matches!(
                self.hitos[h - 1].estado,
                EstadoHito::Aprobado | EstadoHito::Pagado
            )
        {
            Ok(())
        } else {
            Err(Error::HitoAnteriorPendiente)
        }
    }

    /// `momento_declaracion + periodo_objecion` sin desborde.
    fn fin(&self, h: usize) -> u128 {
        self.hitos[h].declaracion.expect("sin declaración vigente") as u128 + self.periodo as u128
    }

    /// §3.2 desde el paso 3 (la obra existe y la firma está).
    fn fondear(&mut self, monto: i128) -> Result<(), Error> {
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        match self.fondeado.checked_add(monto) {
            Some(f) if f <= self.total => {
                self.fondeado = f;
                Ok(())
            }
            _ => Err(Error::ExcedeMontoTotal),
        }
    }

    /// §3.3.
    fn declarar(&mut self, h: u32, evidencia: u8, ahora: u64) -> Result<(), Error> {
        let h = self.hito(h)?;
        self.anterior_ok(h)?;
        let x = &mut self.hitos[h];
        if x.estado != EstadoHito::Pendiente {
            return Err(Error::EstadoInvalido);
        }
        x.estado = EstadoHito::Evidencia;
        x.evidencia = Some(evidencia);
        x.declaracion = Some(ahora);
        x.insp = false;
        x.veed = false;
        x.por_arbitro = false;
        x.objecion_usada = false;
        x.motivo = None;
        x.completa = None;
        Ok(())
    }

    /// §3.4. `firmante` es un índice en el conjunto de direcciones.
    fn aprobar(&mut self, h: u32, firmante: usize, ahora: u64) -> Result<(), Error> {
        let h = self.hito(h)?;
        let es_inspector = firmante == self.roles[INSPECTOR];
        if !es_inspector && firmante != self.roles[VEEDOR] {
            return Err(Error::NoAutorizado);
        }
        self.anterior_ok(h)?;
        let x = &mut self.hitos[h];
        match x.estado {
            EstadoHito::Pagado => return Err(Error::YaPagado),
            EstadoHito::Objetado => return Err(Error::ObjecionAbierta),
            EstadoHito::Pendiente => return Err(Error::EstadoInvalido),
            EstadoHito::Evidencia | EstadoHito::Aprobado => {}
        }
        if (es_inspector && x.insp) || (!es_inspector && x.veed) {
            return Err(Error::YaDecidio);
        }
        if es_inspector {
            x.insp = true;
        } else {
            x.veed = true;
        }
        if x.insp && x.veed {
            x.estado = EstadoHito::Aprobado;
            x.completa = Some(ahora);
        }
        Ok(())
    }

    /// §3.5.
    fn objetar(&mut self, h: u32, motivo: u8, ahora: u64) -> Result<(), Error> {
        let h = self.hito(h)?;
        match self.hitos[h].estado {
            EstadoHito::Pagado => return Err(Error::YaPagado),
            EstadoHito::Objetado => return Err(Error::ObjecionAbierta),
            EstadoHito::Pendiente => return Err(Error::EstadoInvalido),
            EstadoHito::Evidencia | EstadoHito::Aprobado => {}
        }
        if self.hitos[h].objecion_usada {
            return Err(Error::ObjecionYaUsada);
        }
        if self.hitos[h].veed {
            return Err(Error::YaDecidio);
        }
        if ahora as u128 >= self.fin(h) {
            return Err(Error::FueraDePeriodo);
        }
        let x = &mut self.hitos[h];
        x.estado = EstadoHito::Objetado;
        x.objecion_usada = true;
        x.motivo = Some(motivo);
        Ok(())
    }

    /// §3.6.
    fn resolver(&mut self, h: u32, decision: Decision, ahora: u64) -> Result<(), Error> {
        let h = self.hito(h)?;
        let x = &mut self.hitos[h];
        if x.estado != EstadoHito::Objetado {
            return Err(Error::EstadoInvalido);
        }
        match decision {
            Decision::Aceptar => {
                x.estado = EstadoHito::Pendiente;
                x.insp = false;
                x.veed = false;
                x.por_arbitro = false;
                x.evidencia = None;
                x.declaracion = None;
                x.objecion_usada = false;
                x.motivo = None;
            }
            Decision::Rechazar => {
                x.veed = true;
                x.por_arbitro = true;
                if x.insp {
                    x.estado = EstadoHito::Aprobado;
                    x.completa = Some(ahora);
                } else {
                    x.estado = EstadoHito::Evidencia;
                }
            }
        }
        Ok(())
    }

    /// §3.7.
    fn liberar(&mut self, h: u32, ahora: u64) -> Result<(), Error> {
        let h = self.hito(h)?;
        match self.hitos[h].estado {
            EstadoHito::Pagado => return Err(Error::YaPagado),
            EstadoHito::Objetado => return Err(Error::ObjecionAbierta),
            _ => {}
        }
        self.anterior_ok(h)?;
        if self.hitos[h].estado != EstadoHito::Aprobado {
            return Err(Error::EstadoInvalido);
        }
        if (ahora as u128) < self.fin(h) {
            return Err(Error::PeriodoNoCumplido);
        }
        if self.fondeado - self.pagado < self.hitos[h].monto {
            return Err(Error::FondosInsuficientes);
        }
        let x = &mut self.hitos[h];
        x.estado = EstadoHito::Pagado;
        x.pago = Some(ahora);
        self.pagado += x.monto;
        self.finalizada = self.hitos.iter().all(|x| x.estado == EstadoHito::Pagado);
        Ok(())
    }

    /// Primer hito sin pagar (o el último): ahí se concentra la actividad interesante.
    fn frente(&self) -> u32 {
        self.hitos
            .iter()
            .position(|x| x.estado != EstadoHito::Pagado)
            .unwrap_or(self.hitos.len() - 1) as u32
    }
}

/// Conjunto de direcciones del fuzz. Los roles se reparten de forma que una misma dirección
/// cumpla roles distintos en obras distintas (válido por §3.1), para provocar confusiones.
const N_DIRECCIONES: usize = 6;
/// `[municipio, contratista, inspector, veedor, arbitro]` de cada obra.
const ROLES: [[usize; 5]; 3] = [[0, 1, 2, 3, 4], [0, 2, 3, 1, 0], [5, 1, 4, 2, 3]];
const MONTOS: [&[i128]; 3] = [&[100, 200, 300, 400], &[50, 50], &[1_000]];
const PERIODOS: [u64; 3] = [5, 0, 3];
/// Las obras 1 y 2 comparten el SAC 0; la obra 3 usa el SAC 1.
const TOKENS: [usize; 3] = [0, 0, 1];
const SALDO_INICIAL: i128 = 1_000_000;

struct Fuzz {
    env: Env,
    id: Address,
    cli: ObraPublicaClient<'static>,
    dir: std::vec::Vec<Address>,
    tokens: [Address; 2],
    obras: std::vec::Vec<MObra>,
}

impl Fuzz {
    fn nuevo() -> Fuzz {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(T0);
        let id = env.register(ObraPublica, ());
        let cli = ObraPublicaClient::new(&env, &id);
        let dir: std::vec::Vec<Address> = (0..N_DIRECCIONES)
            .map(|_| Address::generate(&env))
            .collect();
        let tokens = [0, 1].map(|_| {
            env.register_stellar_asset_contract_v2(Address::generate(&env))
                .address()
        });
        for t in &tokens {
            for d in &dir {
                StellarAssetClient::new(&env, t).mint(d, &SALDO_INICIAL);
            }
        }
        let mut obras = std::vec::Vec::new();
        for i in 0..3 {
            let r = ROLES[i];
            let id_obra = cli.crear_obra(
                &dir[r[0]],
                &texto(&env, &format!("obra {}", i + 1)),
                &dir[r[1]],
                &dir[r[2]],
                &dir[r[3]],
                &dir[r[4]],
                &tokens[TOKENS[i]],
                &hitos(&env, MONTOS[i]),
                &PERIODOS[i],
            );
            assert_eq!(id_obra, i as u32 + 1);
            obras.push(MObra::nueva(r, TOKENS[i], MONTOS[i], PERIODOS[i]));
        }
        Fuzz {
            env,
            id,
            cli,
            dir,
            tokens,
            obras,
        }
    }

    fn ahora(&self) -> u64 {
        self.env.ledger().timestamp()
    }

    /// Obra y hito que esperaba el contrato, armados desde el modelo.
    fn esperado(&self, i: usize) -> (Obra, std::vec::Vec<Hito>) {
        let m = &self.obras[i];
        let d = |rol: usize| self.dir[m.roles[rol]].clone();
        let obra = Obra {
            id: i as u32 + 1,
            nombre: texto(&self.env, &format!("obra {}", i + 1)),
            municipio: d(0),
            contratista: d(1),
            inspector: d(2),
            veedor: d(3),
            arbitro: d(4),
            token: self.tokens[m.token].clone(),
            monto_original: m.total,
            monto_vigente: m.total,
            fondeado: m.fondeado,
            pagado: m.pagado,
            periodo_objecion: m.periodo,
            cantidad_hitos: m.hitos.len() as u32,
            estado: if m.finalizada {
                EstadoObra::Finalizada
            } else {
                EstadoObra::Activa
            },
            creada_en: T0,
        };
        let hitos = m
            .hitos
            .iter()
            .enumerate()
            .map(|(j, x)| Hito {
                indice: j as u32,
                descripcion: texto(&self.env, &format!("hito {}", j)),
                monto_original: x.monto,
                monto_vigente: x.monto,
                estado: x.estado,
                evidencia_hash: x.evidencia.map(|b| hash(&self.env, b)),
                momento_declaracion: x.declaracion,
                aprobo_inspector: x.insp,
                aprobo_veedor: x.veed,
                veedor_por_arbitro: x.por_arbitro,
                objecion_usada: x.objecion_usada,
                motivo_objecion_hash: x.motivo.map(|b| hash(&self.env, b)),
                momento_aprobacion_completa: x.completa,
                momento_pago: x.pago,
            })
            .collect();
        (obra, hitos)
    }

    /// Invariantes del PRD §8 sobre el modelo, estado del contrato contra el modelo y saldos.
    /// Con `solo = Some(i)` compara contra el contrato solo la obra `i` y el saldo del contrato en
    /// su token (para que el fuzz no sea lento); con `None`, todo.
    fn verificar(&self, ctx: &str, solo: Option<usize>) {
        for (i, m) in self.obras.iter().enumerate() {
            if solo.is_none_or(|s| s == i) {
                let (obra, hitos) = self.esperado(i);
                assert_eq!(
                    self.cli.ver_obra(&obra.id),
                    obra,
                    "{}: obra {}",
                    ctx,
                    obra.id
                );
                let reales = self.cli.ver_hitos(&obra.id);
                assert_eq!(reales.len() as usize, hitos.len(), "{}", ctx);
                for (j, h) in hitos.iter().enumerate() {
                    assert_eq!(
                        &reales.get(j as u32).unwrap(),
                        h,
                        "{}: obra {} hito {}",
                        ctx,
                        obra.id,
                        j
                    );
                }
            }

            // Invariante 4: lo pagado ≤ lo fondeado ≤ el total; lo pagado es la suma de los
            // hitos pagados.
            assert!(0 <= m.pagado && m.pagado <= m.fondeado && m.fondeado <= m.total);
            let suma_pagados: i128 = m
                .hitos
                .iter()
                .filter(|x| x.estado == EstadoHito::Pagado)
                .map(|x| x.monto)
                .sum();
            assert_eq!(m.pagado, suma_pagados, "{}", ctx);
            for (j, x) in m.hitos.iter().enumerate() {
                // Invariante 1: un hito aprobado o pagado tiene las dos aprobaciones.
                if matches!(x.estado, EstadoHito::Aprobado | EstadoHito::Pagado) {
                    assert!(x.insp && x.veed, "{}: hito {} sin dos aprobaciones", ctx, j);
                }
                // Invariante 2: nada avanza en el hito N+1 si el N no está aprobado o pagado.
                if j > 0 && x.estado != EstadoHito::Pendiente {
                    assert!(
                        matches!(
                            m.hitos[j - 1].estado,
                            EstadoHito::Aprobado | EstadoHito::Pagado
                        ),
                        "{}: hito {} avanzó con el anterior en {:?}",
                        ctx,
                        j,
                        m.hitos[j - 1].estado
                    );
                }
            }
        }

        // Saldos reales: el contrato tiene exactamente la suma de los saldos de las obras de cada
        // token, y cada dirección tiene lo que depositó o cobró.
        for (t, token) in self.tokens.iter().enumerate() {
            if solo.is_some_and(|s| self.obras[s].token != t) {
                continue;
            }
            let tok = TokenClient::new(&self.env, token);
            let en_contrato: i128 = self
                .obras
                .iter()
                .filter(|m| m.token == t)
                .map(|m| m.fondeado - m.pagado)
                .sum();
            assert_eq!(tok.balance(&self.id), en_contrato, "{}: token {}", ctx, t);
            if solo.is_some() {
                continue;
            }
            for (k, d) in self.dir.iter().enumerate() {
                let mut esperado = SALDO_INICIAL;
                for m in self.obras.iter().filter(|m| m.token == t) {
                    if m.roles[MUNICIPIO] == k {
                        esperado -= m.fondeado;
                    }
                    if m.roles[CONTRATISTA] == k {
                        esperado += m.pagado;
                    }
                }
                assert_eq!(tok.balance(d), esperado, "{}: dirección {}", ctx, k);
            }
        }
    }

    /// Un evento del contrato si la llamada salió bien (con su nombre y topics), ninguno si no.
    fn verificar_eventos(&self, ctx: &str, res: &Result<(), Error>, nombre: &str, obra: u32) {
        let evs = self
            .env
            .events()
            .all()
            .filter_by_contract(&self.id)
            .events()
            .to_vec();
        if res.is_err() {
            assert!(evs.is_empty(), "{}: una llamada fallida dejó eventos", ctx);
            return;
        }
        assert_eq!(evs.len(), 1, "{}: se esperaba un evento", ctx);
        let xdr::ContractEventBody::V0(cuerpo) = &evs[0].body;
        match (&cuerpo.topics[0], &cuerpo.topics[1]) {
            (xdr::ScVal::Symbol(s), xdr::ScVal::U32(o)) => {
                assert_eq!(s.0.to_utf8_string_lossy(), nombre, "{}", ctx);
                assert_eq!(*o, obra, "{}", ctx);
            }
            otro => panic!("{}: topics inesperados {:?}", ctx, otro),
        }
    }
}

#[test]
fn fuzz_diferencial_contra_el_modelo_de_contract_md() {
    const SEMILLAS: u64 = 16;
    const PASOS: usize = 250;
    let mut errores_vistos = BTreeSet::new();
    let (mut pagos, mut finalizadas) = (0, 0);

    for semilla in 1..=SEMILLAS {
        let mut f = Fuzz::nuevo();
        let mut rng = Rng::nuevo(semilla);
        f.verificar("inicio", None);
        for paso in 0..PASOS {
            // Obra: casi siempre una de las tres; a veces una inexistente.
            let obra: u32 = if rng.menor(25) == 0 {
                rng.uno(&[0, 4, u32::MAX])
            } else {
                1 + rng.menor(3) as u32
            };
            let i = obra.wrapping_sub(1) as usize;
            let existe = i < f.obras.len();
            // Hito: casi siempre el frente de la obra o el siguiente; a veces cualquiera.
            let (n, frente) = if existe {
                (f.obras[i].hitos.len() as u32, f.obras[i].frente())
            } else {
                (4, 0)
            };
            let hito = match rng.menor(10) {
                0 => n,
                1 => rng.menor(n as u64 + 1) as u32,
                2 | 3 => frente + 1,
                _ => frente,
            };
            let ahora = f.ahora();
            let op = rng.menor(100);
            let ctx = format!("semilla {} paso {} op {}", semilla, paso, op);

            macro_rules! en_modelo {
                ($m:ident => $e:expr) => {
                    if existe {
                        let $m = &mut f.obras[i];
                        $e
                    } else {
                        Err(Error::ObraNoExiste)
                    }
                };
            }

            let (real, esperado, nombre) = match op {
                0..=9 => {
                    let monto = rng.uno(&[-5, 0, 1, 50, 100, 400, 1_000, i128::MAX]);
                    let real = resultado(f.cli.try_fondear(&obra, &monto));
                    (real, en_modelo!(m => m.fondear(monto)), "fondeada")
                }
                10..=24 => {
                    let ev = rng.menor(250) as u8;
                    let real = resultado(f.cli.try_declarar_hito(&obra, &hito, &hash(&f.env, ev)));
                    (
                        real,
                        en_modelo!(m => m.declarar(hito, ev, ahora)),
                        "declarado",
                    )
                }
                25..=49 => {
                    let firmante = match (existe, rng.menor(10)) {
                        (true, 0..=3) => f.obras[i].roles[INSPECTOR],
                        (true, 4..=7) => f.obras[i].roles[VEEDOR],
                        _ => rng.menor(N_DIRECCIONES as u64) as usize,
                    };
                    let real = resultado(f.cli.try_aprobar(&obra, &hito, &f.dir[firmante]));
                    (
                        real,
                        en_modelo!(m => m.aprobar(hito, firmante, ahora)),
                        "aprobado",
                    )
                }
                50..=57 => {
                    let motivo = rng.menor(250) as u8;
                    let real = resultado(f.cli.try_objetar(&obra, &hito, &hash(&f.env, motivo)));
                    (
                        real,
                        en_modelo!(m => m.objetar(hito, motivo, ahora)),
                        "objetado",
                    )
                }
                58..=67 => {
                    let d = rng.uno(&[Decision::Aceptar, Decision::Rechazar]);
                    let real = resultado(f.cli.try_resolver_objecion(&obra, &hito, &d));
                    (
                        real,
                        en_modelo!(m => m.resolver(hito, d, ahora)),
                        "resuelta",
                    )
                }
                68..=84 => {
                    let real = resultado(f.cli.try_liberar_pago(&obra, &hito));
                    let esperado = en_modelo!(m => m.liberar(hito, ahora));
                    if esperado.is_ok() {
                        pagos += 1;
                        if f.obras[i].finalizada {
                            finalizadas += 1;
                        }
                    }
                    (real, esperado, "pagado")
                }
                _ => {
                    f.env.ledger().set_timestamp(ahora + rng.menor(4));
                    continue;
                }
            };

            assert_eq!(real, esperado, "{}", ctx);
            f.verificar_eventos(&ctx, &real, nombre, obra);
            if let Err(e) = esperado {
                errores_vistos.insert(e as u32);
            }
            // La obra tocada en cada paso; todo, cada 25 pasos.
            let solo = (paso % 25 != 24).then_some(if existe { i } else { 0 });
            f.verificar(&ctx, solo);
        }
        f.verificar(&format!("semilla {} final", semilla), None);
    }

    // Que el fuzz no sea vacío: recorrió todos los errores posibles fuera de `crear_obra` y llegó
    // a pagar obras completas.
    let todos: BTreeSet<u32> = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].into();
    assert_eq!(errores_vistos, todos, "errores no alcanzados por el fuzz");
    assert!(pagos >= 25, "pocos pagos: {}", pagos);
    assert!(finalizadas >= 3, "pocas obras finalizadas: {}", finalizadas);
}

#[test]
fn fuzz_crear_obra_contra_el_modelo() {
    let e = escenario();
    // Cuatro direcciones para cinco roles: los duplicados son frecuentes.
    let dir: std::vec::Vec<Address> = (0..4).map(|_| Address::generate(&e.env)).collect();
    let mut rng = Rng::nuevo(99);
    let mut ultimo = 0u32;
    let mut vistos = BTreeSet::new();

    for intento in 0..400 {
        let r: [usize; 5] = [0; 5].map(|_| rng.menor(4) as usize);
        let largo = rng.menor(4) as usize;
        let montos: std::vec::Vec<i128> = (0..largo)
            .map(|_| rng.uno(&[-1, 0, 1, 100, i128::MAX / 2 + 1, i128::MAX]))
            .collect();

        // §3.1: roles, después montos.
        let [mun, con, ins, vee, arb] = r;
        let distintos = [con, ins, vee, arb];
        let dup = (0..4).any(|a| (a + 1..4).any(|b| distintos[a] == distintos[b]))
            || mun == con
            || mun == ins
            || mun == vee;
        let esperado = if dup {
            Err(Error::RolesDuplicados)
        } else if montos.is_empty()
            || montos.iter().any(|m| *m <= 0)
            || montos
                .iter()
                .try_fold(0i128, |s, m| s.checked_add(*m))
                .is_none()
        {
            Err(Error::MontoInvalido)
        } else {
            Ok(ultimo + 1)
        };

        let real = resultado(e.cli.try_crear_obra(
            &dir[mun],
            &texto(&e.env, "x"),
            &dir[con],
            &dir[ins],
            &dir[vee],
            &dir[arb],
            &e.sac,
            &hitos(&e.env, &montos),
            &7,
        ));
        assert_eq!(
            real, esperado,
            "intento {}: roles {:?} montos {:?}",
            intento, r, montos
        );
        let evs = e.eventos();
        match real {
            Ok(id) => {
                ultimo = id;
                assert_eq!(evs.len(), 1);
                let o = e.cli.ver_obra(&id);
                assert_eq!(o.monto_original, montos.iter().sum::<i128>());
                assert_eq!(o.cantidad_hitos as usize, montos.len());
                assert_eq!(
                    (o.municipio, o.arbitro),
                    (dir[mun].clone(), dir[arb].clone())
                );
                vistos.insert(0);
            }
            Err(err) => {
                assert!(evs.is_empty());
                vistos.insert(err as u32);
            }
        }
        assert_eq!(e.cli.cantidad_obras(), ultimo);
    }
    assert_eq!(
        vistos,
        [
            0,
            Error::RolesDuplicados as u32,
            Error::MontoInvalido as u32
        ]
        .into()
    );
}
