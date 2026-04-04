"use node";

import { PDFDocument } from "pdf-lib";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Embed an image (JPEG or PNG) into a single-page PDF.
 * Returns base64-encoded PDF string ready for cl-sdk extraction.
 *
 * pdf-lib natively supports JPEG and PNG embedding.
 * For HEIC/WebP, the caller should use Claude vision instead of extraction.
 */
export async function embedImageInPdf(
  imageBuffer: ArrayBuffer,
  mimeType: string
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const bytes = new Uint8Array(imageBuffer);

  const isJpeg = mimeType.includes("jpeg") || mimeType.includes("jpg");
  const isPng = mimeType.includes("png");

  if (!isJpeg && !isPng) {
    throw new Error(`Unsupported image type for PDF embedding: ${mimeType}. Only JPEG and PNG are supported.`);
  }

  const image = isJpeg
    ? await pdfDoc.embedJpg(bytes)
    : await pdfDoc.embedPng(bytes);

  const imgWidth = image.width;
  const imgHeight = image.height;

  // Scale to fit A4 if needed
  const A4_WIDTH = 595;
  const A4_HEIGHT = 842;
  let pageWidth = imgWidth;
  let pageHeight = imgHeight;

  if (imgWidth > A4_WIDTH || imgHeight > A4_HEIGHT) {
    const scale = Math.min(A4_WIDTH / imgWidth, A4_HEIGHT / imgHeight);
    pageWidth = imgWidth * scale;
    pageHeight = imgHeight * scale;
  }

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString("base64");
}

/**
 * Returns true if this image type can be embedded in a PDF via pdf-lib (JPEG/PNG).
 * HEIC and WebP require vision-based processing instead.
 */
export function canEmbedInPdf(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return lower.includes("jpeg") || lower.includes("jpg") || lower.includes("png");
}

/**
 * Classify whether an image is a document photo or a contextual question.
 * Uses Claude Haiku vision for speed/cost.
 */
export async function classifyMediaIntent(
  imageBase64: string,
  userText: string,
  anthropicApiKey: string,
  mimeType: string = "image/jpeg"
): Promise<"document" | "question"> {
  const mediaMime = mimeType.includes("png") ? "image/png" : "image/jpeg";

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaMime,
        data: imageBase64,
      },
    },
  ];

  if (userText) {
    userContent.push({
      type: "text",
      text: `The user sent this message along with the image: "${userText}"`,
    });
  } else {
    userContent.push({
      type: "text",
      text: "No text was sent with the image.",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 16,
        system:
          "You are classifying an image sent to an insurance assistant. Respond with ONLY 'document' or 'question'. 'document' = photo of an insurance document, policy page, declarations page, insurance card, or any official insurance paperwork. 'question' = everything else (screenshots, photos of damage, general images the user wants to discuss).",
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`classifyMediaIntent failed: ${response.status}`);
      return "document"; // Default to document on failure
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.[0]?.text?.trim().toLowerCase() ?? "";

    return text.includes("question") ? "question" : "document";
  } catch (err) {
    console.error("classifyMediaIntent error:", err);
    return "document";
  }
}
