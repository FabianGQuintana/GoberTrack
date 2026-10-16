import { crearApp } from './app.ts';
import { leerConfig } from './config.ts';
import { abrirDb } from './db/conexion.ts';
import { crearClienteRpc } from './indexador/cliente.ts';
import { crearIndexador, crearRelojLedger, type Indexador } from './indexador/index.ts';

const config = leerConfig();
const db = abrirDb(config.rutaDb);
const app = await crearApp({
  db,
  dirEvidencia: config.dirEvidencia,
  origenesCors: config.origenesCors,
  // En testnet, `pagable` usa el tiempo del último ledger (B2); en seed, el reloj de la máquina.
  ahora: config.testnet ? crearRelojLedger(db) : undefined,
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});
app.log.info({ modo: config.modo, db: config.rutaDb }, 'modo de datos');

let indexador: Indexador | undefined;
if (config.testnet) {
  const t = config.testnet;
  indexador = crearIndexador(
    db,
    { contratoId: t.contratoId, ledgerInicial: t.ledgerInicial, intervaloMs: t.intervaloMs },
    { cliente: crearClienteRpc(t), registro: app.log.child({ modulo: 'indexador' }) },
  );
} else {
  const { cantidad } = db.prepare('SELECT COUNT(*) AS cantidad FROM obras').get() as { cantidad: number };
  if (cantidad === 0) app.log.warn('La base no tiene obras: corré `npm run seed` para cargar los datos simulados');
}

let cerrando = false;
async function cerrar(senal: string) {
  if (cerrando) return;
  cerrando = true;
  app.log.info(`${senal}: cerrando`);
  await indexador?.detener();
  await app.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => void cerrar('SIGINT'));
process.on('SIGTERM', () => void cerrar('SIGTERM'));

try {
  await app.listen({ port: config.puerto, host: config.host });
} catch (err) {
  app.log.error(err);
  db.close();
  process.exit(1);
}
indexador?.iniciar();
