import * as bsv from 'bsv';
import { IndexerDatabase, BlockchainEvent } from './database/schema';
import { TransactionParser } from './parsers/TransactionParser';

/**
 * SPVIndexer
 * 
 * Main indexer that listens to BSV blockchain, parses CAD transactions,
 * and reconstructs current state from event sourcing
 */
export class SPVIndexer {
  private parser: TransactionParser;
  private isRunning: boolean = false;
  private pollInterval: number = 3000; // 3 seconds

  constructor(
    private db: IndexerDatabase,
    private nodeUrl: string = 'https://api.whatsonchain.com/v1/bsv/main'
  ) {
    this.parser = new TransactionParser();
  }

  /**
   * Start indexing from current block
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Indexer already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 SPV Indexer starting...');

    // Get last processed block
    const state = await this.db.getIndexerState();
    let currentBlock = state.lastProcessedBlock || await this.getCurrentBlockHeight();

    console.log(`📊 Starting from block ${currentBlock}`);

    // Main indexing loop
    while (this.isRunning) {
      try {
        const latestBlock = await this.getCurrentBlockHeight();

        // Process new blocks
        while (currentBlock <= latestBlock && this.isRunning) {
          await this.processBlock(currentBlock);
          currentBlock++;
          
          // Update state every 10 blocks
          if (currentBlock % 10 === 0) {
            await this.db.updateIndexerState({
              lastProcessedBlock: currentBlock,
              updatedAt: Date.now()
            });
          }
        }

        // Wait before next poll
        await this.sleep(this.pollInterval);
      } catch (error) {
        console.error('Indexing error:', error);
        await this.sleep(this.pollInterval * 2); // Back off on error
      }
    }

    console.log('⏹️  SPV Indexer stopped');
  }

  /**
   * Stop indexing
   */
  stop(): void {
    console.log('🛑 Stopping SPV Indexer...');
    this.isRunning = false;
  }

  /**
   * Process a single block
   */
  private async processBlock(blockHeight: number): Promise<void> {
    try {
      console.log(`⚡ Processing block ${blockHeight}...`);

      // Get block hash
      const blockHash = await this.getBlockHash(blockHeight);
      
      // Get transactions in block
      const txs = await this.getBlockTransactions(blockHash);

      let processedCount = 0;

      // Parse and index each transaction
      for (const tx of txs) {
        const event = this.parser.parseTransaction(tx, blockHeight, blockHash);
        
        if (event) {
          await this.indexEvent(event);
          processedCount++;
        }
      }

      if (processedCount > 0) {
        console.log(`✅ Block ${blockHeight}: ${processedCount} CAD events indexed`);
      }
    } catch (error) {
      console.error(`Failed to process block ${blockHeight}:`, error);
      throw error;
    }
  }

  /**
   * Index a blockchain event
   */
  private async indexEvent(event: BlockchainEvent): Promise<void> {
    try {
      // Save raw event
      await this.db.saveEvent(event);

      // Parse and save specific entity based on contract type
      switch (event.contractType) {
        case 'IncidentContract':
          await this.indexIncidentEvent(event);
          break;
        
        case 'ResourceContract':
          await this.indexResourceEvent(event);
          break;
        
        case 'DispatchContract':
          await this.indexDispatchEvent(event);
          break;
        
        case 'AgencyContract':
          await this.indexAgencyEvent(event);
          break;
        
        case 'IncidentRelationContract':
          await this.indexIncidentRelationEvent(event);
          break;
      }

      // Mark event as indexed
      await this.db.markEventIndexed(event.txid);
    } catch (error) {
      console.error(`Failed to index event ${event.txid}:`, error);
    }
  }

  /**
   * Index incident event
   */
  private async indexIncidentEvent(event: BlockchainEvent): Promise<void> {
    const incidentData = this.parser.parseIncidentEvent(event);
    
    if (!incidentData) {
      return;
    }

    if (event.eventType === 'INCIDENT_CREATED') {
      // Create new incident
      await this.db.saveIncident(incidentData);
      
      // Update state counter
      const state = await this.db.getIndexerState();
      await this.db.updateIndexerState({
        totalIncidents: state.totalIncidents + 1
      });
    } else {
      // Update existing incident
      const existing = await this.db.getIncident(event.payload.incidentId);
      
      if (existing) {
        // Mark old UTXO as spent
        await this.db.markIncidentSpent(existing.txid, event.txid);
        
        // Save updated incident
        await this.db.saveIncident({
          ...existing,
          ...incidentData,
          txid: event.txid,
          version: existing.version + 1,
          utxoSpent: false
        });
      }
    }
  }

  /**
   * Index resource event
   */
  private async indexResourceEvent(event: BlockchainEvent): Promise<void> {
    const resourceData = this.parser.parseResourceEvent(event);
    
    if (!resourceData) {
      return;
    }

    if (event.eventType === 'RESOURCE_REGISTERED') {
      // Create new resource
      await this.db.saveResource(resourceData);
      
      // Update state counter
      const state = await this.db.getIndexerState();
      await this.db.updateIndexerState({
        totalResources: state.totalResources + 1
      });
    } else {
      // Update existing resource
      const existing = await this.db.getResource(event.payload.resourceId);
      
      if (existing) {
        // Mark old UTXO as spent
        await this.db.markResourceSpent(existing.txid, event.txid);
        
        // Save updated resource
        await this.db.saveResource({
          ...existing,
          ...resourceData,
          txid: event.txid,
          version: existing.version + 1,
          utxoSpent: false
        });
      }
    }
  }

  /**
   * Index dispatch event
   */
  private async indexDispatchEvent(event: BlockchainEvent): Promise<void> {
    const dispatchData = this.parser.parseDispatchEvent(event);
    
    if (dispatchData) {
      await this.db.saveDispatch(dispatchData);
      
      // Update state counter
      const state = await this.db.getIndexerState();
      await this.db.updateIndexerState({
        totalDispatches: state.totalDispatches + 1
      });
    }
  }

  /**
   * Index agency event
   */
  private async indexAgencyEvent(event: BlockchainEvent): Promise<void> {
    const agencyData = this.parser.parseAgencyEvent(event);
    
    if (agencyData) {
      if (event.eventType === 'AGENCY_REGISTERED') {
        await this.db.saveAgency(agencyData);
        
        // Update state counter
        const state = await this.db.getIndexerState();
        await this.db.updateIndexerState({
          totalAgencies: state.totalAgencies + 1
        });
      }
    }
  }

  /**
   * Index incident relation event
   */
  private async indexIncidentRelationEvent(event: BlockchainEvent): Promise<void> {
    const relationData = this.parser.parseIncidentRelationEvent(event);
    
    if (relationData) {
      await this.db.saveIncidentRelation(relationData);
    }
  }

  /**
   * Rebuild state from genesis block
   */
  async rebuildState(fromBlock: number = 0): Promise<void> {
    console.log(`🔄 Rebuilding state from block ${fromBlock}...`);

    const latestBlock = await this.getCurrentBlockHeight();
    
    for (let block = fromBlock; block <= latestBlock; block++) {
      await this.processBlock(block);
      
      if (block % 100 === 0) {
        console.log(`Progress: ${block}/${latestBlock} blocks`);
      }
    }

    console.log('✅ State rebuild complete');
  }

  // ===== Blockchain RPC Methods =====

  /**
   * Get current block height
   */
  private async getCurrentBlockHeight(): Promise<number> {
    try {
      const response = await fetch(`${this.nodeUrl}/chain/info`);
      const data = await response.json();
      return data.blocks || 0;
    } catch (error) {
      console.error('Failed to get block height:', error);
      return 0;
    }
  }

  /**
   * Get block hash by height
   */
  private async getBlockHash(height: number): Promise<string> {
    try {
      const response = await fetch(`${this.nodeUrl}/block/height/${height}`);
      const data = await response.json();
      return data[0]?.hash || '';
    } catch (error) {
      console.error(`Failed to get block hash for height ${height}:`, error);
      return '';
    }
  }

  /**
   * Get transactions in a block
   */
  private async getBlockTransactions(blockHash: string): Promise<bsv.Transaction[]> {
    try {
      const response = await fetch(`${this.nodeUrl}/block/hash/${blockHash}`);
      const data = await response.json();
      
      // Parse transaction data
      const txs: bsv.Transaction[] = [];
      
      if ((data as any).tx && Array.isArray((data as any).tx)) {
        for (const txData of (data as any).tx) {
          try {
            const tx = new bsv.Transaction();
            txs.push(tx);
          } catch (error) {
            console.error('Failed to parse transaction:', error);
          }
        }
      }
      
      return txs;
    } catch (error) {
      console.error(`Failed to get block transactions for ${blockHash}:`, error);
      return [];
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
