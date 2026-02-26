import './env';
import { getDb, closeDb } from '../app/lib/mongoClient';

async function clearQueue() {
  try {
    const db = await getDb();
    console.log('🧹 Clearing all queues...');

    const collections = ['JobQueue', 'generations', 'ideas', 'scripts', 'scenes'];
    
    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const result = await collection.deleteMany({});
      console.log(`✅ Cleared ${result.deletedCount} documents from ${collectionName}`);
    }

    // Also clear images bucket if needed?
    // Maybe not, as images are referenced. But if we clear generations, images become orphans.
    // For now, let's just clear the collections mentioned in the original script.
    
    console.log('✅ All queues cleared!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await closeDb();
  }
}

clearQueue();
