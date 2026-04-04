"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const sendEmailNow = internalAction({
  args: {
    pendingEmailId: v.id("pendingEmails"),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.runQuery(internal.email.getPendingEmailById, {
      pendingEmailId: args.pendingEmailId,
    });

    if (!pending) {
      console.error(`Pending email ${args.pendingEmailId} not found`);
      return;
    }

    // If undone or cancelled during the 20s window, skip
    if (pending.status === "undone" || pending.status === "cancelled") {
      console.log(`Email ${args.pendingEmailId} was ${pending.status}, skipping send`);
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not set");
      await ctx.runMutation(internal.email.updatePendingEmailStatus, {
        pendingEmailId: args.pendingEmailId,
        status: "failed",
      });
      return;
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || "Spot <spot@spot.claritylabs.inc>";

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [pending.recipientEmail],
          cc: pending.ccEmail ? [pending.ccEmail] : undefined,
          subject: pending.subject,
          html: pending.htmlBody,
          reply_to: pending.ccEmail || undefined,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Resend API error ${response.status}: ${errorBody}`);
      }

      await ctx.runMutation(internal.email.updatePendingEmailStatus, {
        pendingEmailId: args.pendingEmailId,
        status: "sent",
      });

      await ctx.runMutation(internal.messages.log, {
        userId: pending.userId,
        direction: "outbound",
        body: `[Email sent] To: ${pending.recipientEmail} — Subject: ${pending.subject}`,
        hasAttachment: false,
        channel: "email",
      });

      console.log(`Email sent to ${pending.recipientEmail}: ${pending.subject}`);
    } catch (error: any) {
      console.error(`Failed to send email ${args.pendingEmailId}:`, error.message);
      await ctx.runMutation(internal.email.updatePendingEmailStatus, {
        pendingEmailId: args.pendingEmailId,
        status: "failed",
      });
    }
  },
});
