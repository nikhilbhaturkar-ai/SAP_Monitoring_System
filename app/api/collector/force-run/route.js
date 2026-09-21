import { NextResponse } from 'next/server';
import { collectOnce } from '../../../../lib/server/services/collector.js';
import { processAlertNotifications } from '../../../../lib/server/services/notifier.js';

export async function POST() {
  try {
    console.log(`> [Force Run API] Force collection execution started at ${new Date().toISOString()}`);
    
    // Execute SAP collection
    await collectOnce();
    
    // Process email notifications for the new run
    await processAlertNotifications();
    
    console.log(`> [Force Run API] Force collection & notifications completed successfully.`);
    return NextResponse.json({
      success: true,
      message: 'Collection and notification cycle completed successfully.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Force Run API] Error during forced collection execution:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to force collection run'
    }, { status: 500 });
  }
}
