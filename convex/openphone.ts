import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const webhook = httpAction(async (ctx, request) => {
  const body = await request.json();

  if (body.type !== "message.received") {
    return new Response("ignored", { status: 200 });
  }

  const message = body.data?.object;
  if (!message || message.direction !== "incoming") {
    return new Response("ignored", { status: 200 });
  }

  const from: string = message.from;
  const text: string = (message.text || "").trim();
  const media: Array<{ url: string; type: string }> = message.media || [];
  const messageId: string = message.id;

  // Phase 1: Claim this webhook
  const { claimed } = await ctx.runMutation(internal.ingest.claimWebhook, {
    openPhoneId: messageId,
  });
  if (!claimed) {
    return new Response("duplicate", { status: 200 });
  }

  // Phase 2: Ingest
  const result = await ctx.runMutation(internal.ingest.ingestMessage, {
    openPhoneId: messageId,
    from,
    text,
    hasAttachment: media.length > 0,
  });

  if (!result) {
    return new Response("ok", { status: 200 });
  }

  const { userId, uploadToken } = result;

  // Attachments bypass debounce — dispatch immediately
  if (media.length > 0) {
    await ctx.scheduler.runAfter(0, internal.process.dispatchAttachment, {
      userId,
      phone: from,
      uploadToken,
      mediaParts: media.map((a) => ({ url: a.url, mimeType: a.type || "application/pdf" })),
      userText: text,
    });
    return new Response("ok", { status: 200 });
  }

  // Text-only: route through 2s debounce → processBufferedTurn
  const { isFirstInWindow } = await ctx.runMutation(
    internal.users.appendMessageBuffer,
    { userId, text }
  );
  console.log("[spot:debounce]", { userId, isFirstInWindow, channel: "openphone" });

  if (isFirstInWindow) {
    await ctx.scheduler.runAfter(2000, internal.process.processBufferedTurn, {
      userId,
      phone: from,
      uploadToken,
    });
  }

  return new Response("ok", { status: 200 });
});
