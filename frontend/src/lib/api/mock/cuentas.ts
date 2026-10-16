// DATO SIMULADO: cuentas y tokens del modo mock. Las mismas direcciones que deriva el seed del
// backend: Keypair.fromRawEd25519Seed(sha256("opv-dato-simulado:cuenta:<etiqueta>")) para cuentas y
// StrKey.encodeContract(sha256("opv-dato-simulado:token:<etiqueta>")) para tokens.
// Módulo aparte del escenario para que el tablero pueda conocer el token oficial del mock sin
// cargar todo el escenario.

export const CUENTAS = {
  municipio: "GCERZHM3LQUL2UHMFAFWQ5MVCL3E7J6WKANPCCU43P3BVPL4TNUS7OS2",
  inspectorA: "GCV3H6GC42W5HTJCY5PLV3QRL4JF2NZROGEJEN2JO3KTERNSWCKPJQ4Q",
  inspectorB: "GDOZUCU6D3SF4VYJA4O44I6EZJW76ENB3GHLXHPFF4UEBEBVDCE4TMKJ",
  contratistaAromos: "GDWY5UHS32KSNPUWQME7XDTZK5WELMTJ6QHNWDLXZZRMP4ZVKTWSGGVT", // contratista-vial-litoral
  veedorAromos: "GAQ2RXROJRSG6QMBHAM2O7SA6OLPNKF6CFSK7HM7WXQVYMWINRA4KIY5", // veedor-vecinal-los-aromos
  contratistaAgua: "GCI442XDOTV3YGADBLGBH4BFJFQGNOO23UDO5CJURUN3CZMEJ2VE6LGT", // cooperativa-agua-esperanza
  veedorAgua: "GD6V5OZXEE2RQ5JY7RHA2EALRI5H4QBFTFN33HSLAHPW5Y72XB7DBC6E", // veedor-barrio-esperanza
  contratistaEscuela: "GD3EW6HTLPTYWNPO5AMZNZSXYSPKXFGJ6SLBSSWGYZX6ZTOQR2FXQPFF", // constructora-del-nea
  veedorEscuela: "GDZTRSRJMBY74QZKJTFTQWLN6UEAMNOTTOBSPDF22ZOIVWXHESQLQ7N5", // veedor-cooperadora-escuela-512
  contratistaPlaza: "GCWCZ5BV6DSETBXOTKWAATABVVGU7AEJ3Y74OBM2AWP47SBI2CIGDH7H", // electro-litoral
  veedorPlaza: "GCTE5P3CJD5G7JEJCPJULLACPJSTEG7TQGOLAQ35BLFVZHLSOJKH633S", // veedor-vecinal-plaza-25-de-mayo
  contratistaVeredas: "GDSAYL5ZBRHJ4EV42NXY7UUITZW6YMIVEGJ5YRVAVDC6F7MQ2UZHQSV5", // constructora-san-martin
  veedorVeredas: "GBZVTKBEVE4I27QMO7IPGRZACOM42ZXPTYK5ZKT6NMJFNA4CHZIIRRYL", // veedor-vecinal-san-martin
  contratistaBacheo: "GDHZIQTAFIQ5R23XOHKRNVC3XW5PQ6WJL7NZLCJMA5TMK6WFPMYTIX3P", // bacheos-del-litoral
  veedorBacheo: "GCNSFXWVKRHMQRQNWFOX2NXDXDBBPA5L3F3OU6TJOEKKROBUBPXZKUXN", // veedor-vecinal-belgrano
} as const;

/** Token oficial del mock: el activo de prueba tipo USDC del seed (token:usdc-prueba). */
export const TOKEN = "CDWEVQQEC337THKU72NXNG54HAITKW2CQJUNHH2S5S7CODAAF5EJU6PE";

/** Token que NO es el oficial (token:no-oficial), para mostrar el aviso del tablero. */
export const TOKEN_NO_OFICIAL = "CBZLGPGXOY4M3JQGSJV3TX52LHNTD5GJ2PZ662S434A3ZFNNIKXSKQOE";
