import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check for policy expiration reminders every hour
crons.interval("check reminders", { hours: 1 }, internal.reminderActions.checkAndSendReminders);

export default crons;
