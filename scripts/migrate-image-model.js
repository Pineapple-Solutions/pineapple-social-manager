// scripts/migrate-image-model.js
const sqlite3 = require('node_modules/better-sqlite3');
const db = sqlite3('./prisma/prisma/social-manager.db');

try {
  db.exec('ALTER TABLE "AIProviderConfig" ADD COLUMN "imageModel" TEXT');
  console.log('✅ imageModel aggiunto');
} catch(e) {
  console.log('imageModel:', e.message);
}
try {
  db.exec('ALTER TABLE "AIProviderConfig" ADD COLUMN "imageEnabled" INTEGER NOT NULL DEFAULT 0');
  console.log('✅ imageEnabled aggiunto');
} catch(e) {
  console.log('imageEnabled:', e.message);
}

// Migra: per ogni riga che ha videoModel impostato a un modello immagine (non veo),
// copia il valore in imageModel e svuota videoModel
const rows = db.prepare('SELECT id, videoModel, videoEnabled FROM "AIProviderConfig"').all();
for (const row of rows) {
  if (row.videoModel && !row.videoModel.startsWith('veo-')) {
    db.prepare('UPDATE "AIProviderConfig" SET imageModel = ?, imageEnabled = ?, videoModel = NULL, videoEnabled = 0 WHERE id = ?')
      .run(row.videoModel, row.videoEnabled ? 1 : 0, row.id);
    console.log(`✅ Migrato provider ${row.id}: imageModel=${row.videoModel}`);
  }
}

db.close();
console.log('✅ Migrazione completata');


