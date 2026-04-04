"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const checkAndSendReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const dueReminders = await ctx.runQuery(
      internal.reminders.getPendingDueReminders
    );

    for (const reminder of dueReminders) {
      const user = await ctx.runQuery(internal.users.get, {
        userId: reminder.userId,
      });
      const policy = await ctx.runQuery(internal.policies.getById, {
        policyId: reminder.policyId,
      });

      if (!user || !policy) {
        await ctx.runMutation(internal.reminders.markSent, {
          reminderId: reminder._id,
        });
        continue;
      }

      const carrier = policy.carrier ?? "your";
      const category = policy.category ?? "insurance";
      const policyNumber = policy.policyNumber
        ? ` (${policy.policyNumber})`
        : "";
      const expirationDate = policy.expirationDate ?? "soon";

      const message = `Hey! Your ${carrier} ${category} policy${policyNumber} expires on ${expirationDate}. Might be a good time to check in with your agent about renewal.`;

      if (user.linqChatId) {
        await ctx.runAction(internal.sendLinq.sendLinqMessage, {
          chatId: user.linqChatId,
          body: message,
        });
      } else {
        await ctx.runAction(internal.send.sendSms, {
          to: user.phone,
          body: message,
        });
      }

      await ctx.runMutation(internal.messages.log, {
        userId: user._id,
        direction: "outbound",
        body: message,
        hasAttachment: false,
        channel: user.linqChatId ? "linq" : "openphone",
      });

      await ctx.runMutation(internal.reminders.markSent, {
        reminderId: reminder._id,
      });
    }
  },
});
