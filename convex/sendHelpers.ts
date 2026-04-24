"use node";
import { internal } from "./_generated/api";

// Channel-aware send: tries Linq first, then iMessage bridge, falls back to OpenPhone.
// Guards against identical consecutive outbound messages.
export async function sendAndLog(
  ctx: any,
  userId: any,
  phone: string,
  body: string,
  linqChatId?: string,
  imessageSender?: string
) {
  // Duplicate-guard: if the last outbound message was byte-identical, append
  // an invisible suffix so the user never sees the same line twice in a row.
  const lastOutbound = await ctx.runQuery(internal.messages.getLastOutbound, {
    userId,
  });
  let finalBody = body;
  if (lastOutbound && lastOutbound.body === body) {
    console.warn("[spot:duplicate_guard]", { userId, body });
    finalBody = body + "​"; // zero-width space; renders identical but differs byte-wise
  }

  let usedChannel = "openphone";

  if (linqChatId) {
    try {
      await ctx.runAction(internal.sendLinq.sendLinqMessage, {
        chatId: linqChatId,
        body: finalBody,
      });
      usedChannel = "linq";
    } catch (err) {
      console.error("Linq send failed, falling back to OpenPhone:", err);
      await ctx.runAction(internal.send.sendSms, { to: phone, body: finalBody });
    }
  } else if (imessageSender) {
    try {
      await ctx.runAction(internal.sendBridge.sendBridgeMessage, {
        to: imessageSender,
        body: finalBody,
      });
      usedChannel = "imessage_bridge";
    } catch (err) {
      console.error("iMessage bridge failed, falling back to OpenPhone:", err);
      await ctx.runAction(internal.send.sendSms, { to: phone, body: finalBody });
    }
  } else {
    await ctx.runAction(internal.send.sendSms, { to: phone, body: finalBody });
  }

  await ctx.runMutation(internal.messages.log, {
    userId,
    direction: "outbound" as const,
    body: finalBody,
    hasAttachment: false,
    channel: usedChannel,
  });
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tennis-rhythm delay: short messages arrive fast, longer messages take a beat.
// Base 300ms + 8ms per char, clamped to [400, 1200]ms, with ±100ms jitter.
function bubbleDelay(nextMessage: string): number {
  const base = 300 + nextMessage.length * 8;
  const clamped = Math.max(400, Math.min(1200, base));
  return clamped + (Math.random() * 200 - 100);
}

export async function sendBurst(
  ctx: any,
  userId: any,
  phone: string,
  messages: string[],
  linqChatId?: string,
  imessageSender?: string
) {
  for (let i = 0; i < messages.length; i++) {
    if (i > 0) await sleep(bubbleDelay(messages[i]));
    await sendAndLog(ctx, userId, phone, messages[i], linqChatId, imessageSender);
  }
}

export function getUploadLink(uploadToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://spot.claritylabs.inc";
  return `${baseUrl}/app/${uploadToken}`;
}

export function getTrackLink(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://spot.claritylabs.inc";
  return `${baseUrl}/track/${token}`;
}

export function getFiremarkLink(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://spot.claritylabs.inc";
  return `${baseUrl}/firemark/${token}`;
}
