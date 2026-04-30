import { config } from 'dotenv';
config({ path: '.env.local' });

import { getDb } from '../app/lib/mongoClient';

async function migrate() {
  console.log('=== Studio Clean Flow Migration ===');
  const db = await getDb();

  const updateResult = await db.collection('Generations').updateMany(
    { clips: { $exists: false }, format_version: { $ne: 'legacy' } },
    { $set: { format_version: 'legacy' } }
  );
  console.log(`Marked ${updateResult.modifiedCount} generations as legacy`);

  for (const collName of ['Scripts', 'Scenes', 'Ideas']) {
    try {
      await db.collection(collName).drop();
      console.log(`Dropped ${collName} collection`);
    } catch (err) {
      const codeName = (err as { codeName?: string }).codeName;
      if (codeName === 'NamespaceNotFound') {
        console.log(`${collName} collection already absent`);
      } else {
        throw err;
      }
    }
  }

  await db.collection('Generations').createIndex({ format_version: 1 });
  console.log('Created format_version index on Generations');

  console.log('=== Migration done ===');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
