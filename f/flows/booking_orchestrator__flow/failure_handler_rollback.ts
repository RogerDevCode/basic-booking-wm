export async function main(error: any, results: any, flowInput: any) {
  console.error('[Booking Flow] Error:', error);
  console.error('[Booking Flow] Failed at step:', error.step_id);
  
  const rollbackSteps = [];
  
  // Si se creó evento GCal, eliminarlo
  if (results.gcal_create_event?.data?.event_id) {
    rollbackSteps.push({
      action: 'delete_gcal',
      event_id: results.gcal_create_event.data.event_id
    });
  }
  
  // Si se adquirió lock, liberarlo
  if (results.distributed_lock_acquire?.data?.owner_token) {
    rollbackSteps.push({
      action: 'release_lock',
      provider_id: flowInput.provider_id,
      start_time: flowInput.start_time,
      owner_token: results.distributed_lock_acquire.data.owner_token
    });
  }
  
  // Log a DLQ
  rollbackSteps.push({
    action: 'log_dlq',
    error: error.message,
    step_id: error.step_id
  });
  
  return {
    rollback_steps: rollbackSteps,
    error_message: error.message,
    failed_step: error.step_id
  };
}
