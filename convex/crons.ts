import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check for policy expiration reminders every hour
crons.interval("check reminders", { hours: 1 }, internal.reminderActions.checkAndSendReminders);

// Check for proactive alerts daily (seasonal, milestones, expiration nudges)
crons.interval("proactive alerts", { hours: 24 }, internal.proactiveAlertActions.checkProactiveAlerts);

export default crons;
