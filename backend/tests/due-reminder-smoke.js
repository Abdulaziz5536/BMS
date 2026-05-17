const { runDueDateReminders, runReminderForInvoice, runRemindersForTenant } = require('../services/due-reminder-service');

(async () => {
  try {
    console.log('Running due date reminders (dry run)...');
    const res = await runDueDateReminders({ dryRun: true });
    console.log('Result:', res);

    // Basic assertions
    if (typeof res.checked !== 'number' || typeof res.sent !== 'number') {
      console.error('Unexpected result shape');
      process.exit(2);
    }

    console.log('Dry-run smoke test passed.');
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err);
    process.exit(1);
  }
})();
