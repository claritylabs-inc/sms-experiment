import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// HMAC-SHA256(secret, rawBody), hex-encoded
async function verifySignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (computed.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

function isPhoneNumber(sender: string): boolean {
  // E.164 format or numeric-ish string
  return /^\+?\d[\d\s()-]{6,}$/.test(sender.trim());
}

function normalizePhone(sender: string): string {
  const digits = sender.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export const webhook = httpAction(async (ctx, request) => {
  const rawBody = await request.text();

  // Verify HMAC signature
  const webhookSecret = process.env.IMESSAGE_BRIDGE_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = request.headers.get("X-Webhook-Signature") || "";
    const valid = await verifySignature(rawBody, signature, webhookSecret);
    if (!valid) {
      console.error("iMessage bridge webhook signature verification failed");
      return new Response("unauthorized", { status: 401 });
    }
  }

  const body = JSON.parse(rawBody);

  // Bridge payload: { message: { id, sender, text, hasAttachments, attachments } }
  const message = body.message;
  if (!message) {
    console.error("iMessage bridge webhook missing message:", body);
    return new Response("bad request", { status: 400 });
  }

  const messageId: string = message.id || "";
  const sender: string = message.sender || "";
  const text: string = message.text || "";
  const hasAttachments: boolean = message.hasAttachments || false;

  if (!sender) {
    console.error("iMessage bridge webhook missing sender:", body);
    return new Response("bad request", { status: 400 });
  }

  if (!messageId) {
    console.error("iMessage bridge webhook missing message id:", body);
    return new Response("bad request", { status: 400 });
  }

  // Normalize phone if sender is a phone number
  const phone = isPhoneNumber(sender) ? normalizePhone(sender) : sender;

  // Phase 1: Claim webhook for dedup
  const dedupeId = `imbridge_${messageId}`;
  const { claimed } = await ctx.runMutation(internal.ingest.claimWebhook, {
    openPhoneId: dedupeId,
  });
  if (!claimed) {
    return new Response("duplicate", { status: 200 });
  }

  // Phase 2: Ingest message
  const result = await ctx.runMutation(internal.ingest.ingestBridgeMessage, {
    messageId: dedupeId,
    from: phone,
    text,
    hasAttachment: hasAttachments,
    imessageSender: sender,
  });

  if (!result) {
    return new Response("ok", { status: 200 });
  }

  const { userId, uploadToken, imessageSender } = result;

  // Bridge attachments not supported in phase 1 — treat any inbound as text-only.
  // If the user sent only an attachment with no text, nudge them to use upload link.
  if (hasAttachments && !text) {
    await ctx.scheduler.runAfter(0, internal.process.nudgeForPolicy, {
      userId,
      phone,
      input: "",
      uploadToken,
      imessageSender,
    });
    return new Response("ok", { status: 200 });
  }

  // Text-only: route through 2s debounce → processBufferedTurn
  const { isFirstInWindow } = await ctx.runMutation(
    internal.users.appendMessageBuffer,
    { userId, text }
  );
  console.log("[spot:debounce]", { userId, isFirstInWindow, channel: "imessage_bridge" });

  if (isFirstInWindow) {
    await ctx.scheduler.runAfter(2000, internal.process.processBufferedTurn, {
      userId,
      phone,
      uploadToken,
      imessageSender,
    });
  }

  return new Response("ok", { status: 200 });
});
