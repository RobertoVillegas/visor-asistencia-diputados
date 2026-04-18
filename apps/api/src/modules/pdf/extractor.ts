import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractedPdfDocument {
  pageCount: number;
  rawText: string;
  pages: string[];
}

export interface FetchedPdf {
  bytes: Uint8Array;
  contentHash: string;
  byteSize: number;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
  httpStatus: number;
}

export async function fetchPdfFromUrl(url: string): Promise<FetchedPdf> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentHash = createHash("sha256").update(bytes).digest("hex");

  return {
    byteSize: bytes.byteLength,
    bytes,
    contentHash,
    contentType: response.headers.get("content-type"),
    etag: response.headers.get("etag"),
    httpStatus: response.status,
    lastModified: response.headers.get("last-modified"),
  };
}

export async function extractPdfTextFromBytes(bytes: Uint8Array): Promise<ExtractedPdfDocument> {
  const document = await getDocumentProxy(bytes);
  const merged = await extractText(document, { mergePages: true });
  const byPage = await extractText(document, { mergePages: false });
  const pages = Array.isArray(byPage.text)
    ? byPage.text.map((page) => String(page))
    : [String(byPage.text)];

  return {
    pageCount: merged.totalPages,
    pages,
    rawText: typeof merged.text === "string" ? merged.text : String(merged.text),
  };
}

export async function extractPdfTextFromUrl(url: string): Promise<ExtractedPdfDocument> {
  const fetched = await fetchPdfFromUrl(url);
  return extractPdfTextFromBytes(fetched.bytes);
}
