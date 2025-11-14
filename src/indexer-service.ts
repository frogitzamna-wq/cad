import { SPVIndexer } from './indexer/SPVIndexer';
import { IndexerDatabase } from './indexer/database/IndexerDatabase';

const BSV_NODE_URL = process.env.BSV_API_URL || 'https://api.whatsonchain.com/v1/bsv/main';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://cad_user:cadpass123@localhost:5432/cad_db';
const POLL_INTERVAL = parseInt(process.env.INDEXER_POLL_INTERVAL || '30000'); // 30 seconds

async function main() {
  console.log('🔍 Starting SPV Indexer Service...');
  console.log(`   BSV Node: ${BSV_NODE_URL}`);
  console.log(`   Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`   Poll Interval: ${POLL_INTERVAL}ms`);

  // Initialize database
  const database = new IndexerDatabase(DATABASE_URL);
  await database.initialize();

  // Initialize indexer
  const indexer = new SPVIndexer(database, BSV_NODE_URL);

  // Get starting block
  const state = await database.getIndexerState();
  console.log(`📊 Current state: ${state.lastProcessedBlock} blocks indexed`);

  // Start indexing
  console.log('🚀 Starting blockchain indexing...');
  await indexer.start();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down indexer...');
    await indexer.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down indexer...');
    await indexer.stop();
    process.exit(0);
  });

  // Keep process alive
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  console.log('✅ SPV Indexer Service running');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
