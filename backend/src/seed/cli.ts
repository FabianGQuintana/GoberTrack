import { leerConfig } from '../config.ts';
import { abrirDb } from '../db/conexion.ts';
import { sembrar } from './sembrar.ts';

// npm run seed — carga los DATOS SIMULADOS en la base configurada (DB_PATH, EVIDENCIA_DIR).
const config = leerConfig();
if (config.modo !== 'seed') {
  console.error('MODO_DATOS=testnet: en este modo los datos salen del contrato y no se siembra nada');
  process.exit(1);
}
const db = abrirDb(config.rutaDb);
try {
  const resumen = await sembrar(db, { dirEvidencia: config.dirEvidencia });
  console.log(`DATO SIMULADO: base sembrada en ${config.rutaDb}`);
  for (const obra of resumen.obras) {
    console.log(`  obra ${obra.id} · ${obra.nombre} · hitos: ${obra.estados.join(', ')}`);
  }
  console.log(
    `  ${resumen.hitos} hitos, ${resumen.eventos} eventos, ` +
      `${resumen.evidencias} archivos de evidencia en ${config.dirEvidencia}`,
  );
} finally {
  db.close();
}
