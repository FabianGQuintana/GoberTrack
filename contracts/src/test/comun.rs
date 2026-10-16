//! Helpers de preparación compartidos por todas las pruebas.

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, String, Vec,
};

use crate::{Clave, Decision, EstadoHito, Hito, NuevoHito, ObraPublica, ObraPublicaClient};

pub const T0: u64 = 10_000;
pub const PERIODO: u64 = 1_000;
/// Montos de los 4 hitos de la obra estándar (total 1000).
pub const MONTOS: [i128; 4] = [100, 200, 300, 400];
pub const TOTAL: i128 = 1_000;

pub struct Ctx {
    pub env: Env,
    pub id: Address,
    pub client: ObraPublicaClient<'static>,
    pub municipio: Address,
    pub contratista: Address,
    pub inspector: Address,
    pub veedor: Address,
    pub arbitro: Address,
    pub token: Address,
    pub tok: TokenClient<'static>,
}

/// Entorno con auths mockeadas, timestamp `T0`, contrato registrado y un SAC con 1 000 000 para
/// el municipio. No crea ninguna obra.
pub fn ctx() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);
    let id = env.register(ObraPublica, ());
    let client = ObraPublicaClient::new(&env, &id);
    let admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(admin).address();
    let tok = TokenClient::new(&env, &token);
    let municipio = Address::generate(&env);
    StellarAssetClient::new(&env, &token).mint(&municipio, &1_000_000);
    Ctx {
        id,
        client,
        municipio,
        contratista: Address::generate(&env),
        inspector: Address::generate(&env),
        veedor: Address::generate(&env),
        arbitro: Address::generate(&env),
        token,
        tok,
        env,
    }
}

pub fn texto(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

pub fn hash(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

pub fn hitos(env: &Env, montos: &[i128]) -> Vec<NuevoHito> {
    let mut v = Vec::new(env);
    for (i, m) in montos.iter().enumerate() {
        let desc = match i {
            0 => "hito 0",
            1 => "hito 1",
            2 => "hito 2",
            _ => "hito n",
        };
        v.push_back(NuevoHito {
            descripcion: texto(env, desc),
            monto: *m,
        });
    }
    v
}

impl Ctx {
    /// Crea una obra con los roles del contexto, el token del contexto y los hitos dados.
    pub fn crear_con(&self, montos: &[i128], periodo: u64) -> u32 {
        self.client.crear_obra(
            &self.municipio,
            &texto(&self.env, "Puente"),
            &self.contratista,
            &self.inspector,
            &self.veedor,
            &self.arbitro,
            &self.token,
            &hitos(&self.env, montos),
            &periodo,
        )
    }

    /// Obra estándar: 4 hitos [100, 200, 300, 400], período de objeción `PERIODO`.
    pub fn crear(&self) -> u32 {
        self.crear_con(&MONTOS, PERIODO)
    }

    pub fn fondear(&self, obra: u32, monto: i128) {
        self.client.fondear(&obra, &monto);
    }

    pub fn declarar(&self, obra: u32, hito: u32) {
        self.client.declarar_hito(&obra, &hito, &hash(&self.env, 1));
    }

    pub fn aprobar_inspector(&self, obra: u32, hito: u32) {
        self.client.aprobar(&obra, &hito, &self.inspector);
    }

    pub fn aprobar_veedor(&self, obra: u32, hito: u32) {
        self.client.aprobar(&obra, &hito, &self.veedor);
    }

    /// Declarar + aprobación de inspector y veedor (el hito queda `Aprobado`).
    pub fn declarar_y_aprobar(&self, obra: u32, hito: u32) {
        self.declarar(obra, hito);
        self.aprobar_inspector(obra, hito);
        self.aprobar_veedor(obra, hito);
    }

    pub fn objetar(&self, obra: u32, hito: u32) {
        self.client.objetar(&obra, &hito, &hash(&self.env, 9));
    }

    pub fn resolver(&self, obra: u32, hito: u32, decision: Decision) {
        self.client.resolver_objecion(&obra, &hito, &decision);
    }

    pub fn avanzar(&self, segundos: u64) {
        let ahora = self.env.ledger().timestamp();
        self.env.ledger().set_timestamp(ahora + segundos);
    }

    pub fn ir_a(&self, t: u64) {
        self.env.ledger().set_timestamp(t);
    }

    pub fn ahora(&self) -> u64 {
        self.env.ledger().timestamp()
    }

    pub fn hito(&self, obra: u32, hito: u32) -> Hito {
        self.client.ver_hito(&obra, &hito)
    }

    /// Escribe un hito directo en el almacenamiento (para estados que todavía no se alcanzan
    /// con la API, como `Objetado`).
    pub fn forzar_hito(&self, obra: u32, hito: u32, f: impl FnOnce(&mut Hito)) {
        let mut h = self.hito(obra, hito);
        f(&mut h);
        self.env.as_contract(&self.id, || {
            self.env
                .storage()
                .persistent()
                .set(&Clave::Hito(obra, hito), &h);
        });
    }

    pub fn forzar_estado(&self, obra: u32, hito: u32, estado: EstadoHito) {
        self.forzar_hito(obra, hito, |h| h.estado = estado);
    }
}

/// `try_<fn>` devuelve `Result<Result<T, ConversionError>, Result<Error, InvokeError>>`.
macro_rules! assert_err {
    ($expr:expr, $err:expr) => {
        assert_eq!($expr, Err(Ok($err)))
    };
}

pub fn vacio(env: &Env) -> Vec<NuevoHito> {
    vec![env]
}
