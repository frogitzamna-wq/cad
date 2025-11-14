import { I3Server } from './adapters/nena-i3/I3Server';

const PORT = parseInt(process.env.I3_ADAPTER_PORT || '5000');

async function main() {
  console.log('🚀 Starting NENA i3 Adapter Service...');
  console.log(`   Port: ${PORT}`);
  console.log(`   Protocol: NENA i3 v3.0`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

  const server = new I3Server(PORT);

  // Register callStart handler
  server.onCallStartReceived(async (call) => {
    console.log(`\n🆕 Processing 911 call:`);
    console.log(`   Call ID: ${call.callId}`);
    console.log(`   Caller: ${call.callerNumber}`);
    console.log(`   Event Code: ${call.eventCode}`);
    
    if (call.callerLocation) {
      console.log(`   Location: ${call.callerLocation.lat}, ${call.callerLocation.lng}`);
      if (call.callerLocation.accuracy) {
        console.log(`   Accuracy: ±${call.callerLocation.accuracy}m`);
      }
    }

    // Get APCO mapping
    const mapper = server.getAPCOMapper();
    const mapping = mapper.getMappingOrDefault(call.eventCode);
    
    console.log(`\n📋 Incident Details:`);
    console.log(`   Type: ${mapping.incidentType}`);
    console.log(`   Priority: ${mapping.priority}`);
    console.log(`   Required Resources: ${mapping.requiredResources.join(', ')}`);
    console.log(`   Default Units: ${mapping.defaultUnits}`);
    console.log(`   Description: ${mapping.description}`);

    // TODO: Create blockchain transaction here when wallet is funded
    const mockTxid = `mock_tx_${Date.now()}`;

    return {
      status: 'ACCEPTED',
      incidentId: `incident_${call.callId}`,
      txid: mockTxid,
      message: `Call received and incident created`
    };
  });

  // Start server
  await server.start();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('\nSIGTERM received, shutting down i3 adapter...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('\nSIGINT received, shutting down i3 adapter...');
    await server.stop();
    process.exit(0);
  });

  console.log('\n✅ NENA i3 Adapter Service ready');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
