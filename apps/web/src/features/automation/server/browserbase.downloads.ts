import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yauzl from "yauzl";

const DOWNLOAD_DIR = path.join(os.tmpdir(), "teamoptix-insight", "automation-downloads");

function openZip(buffer: Buffer) {
  return new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => {
      if (error || !zipfile) reject(error ?? new Error("Could not open Browserbase download zip."));
      else resolve(zipfile);
    });
  });
}

function readZipEntry(zipfile: yauzl.ZipFile, entry: yauzl.Entry) {
  return new Promise<Buffer>((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("Could not read Browserbase download entry."));
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

export async function saveFirstBrowserbaseDownloadZipEntry(input: {
  zipBuffer: Buffer;
  filenamePrefix?: string;
}) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const zipfile = await openZip(input.zipBuffer);

  try {
    return await new Promise<{ suggestedFilename: string; savedPath: string; size: number }>((resolve, reject) => {
      zipfile.readEntry();

      zipfile.on("entry", async (entry) => {
        try {
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
            return;
          }

          const contents = await readZipEntry(zipfile, entry);
          const suggestedFilename = path.basename(entry.fileName || "browserbase-download.xls");
          const safeName = suggestedFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const savedPath = path.join(
            DOWNLOAD_DIR,
            `${Date.now()}-${input.filenamePrefix ?? "browserbase"}-${safeName}`
          );

          await writeFile(savedPath, contents);
          resolve({ suggestedFilename, savedPath, size: contents.length });
          zipfile.close();
        } catch (error) {
          reject(error);
        }
      });

      zipfile.on("end", () => reject(new Error("Browserbase download zip did not contain any files.")));
      zipfile.on("error", reject);
    });
  } finally {
    zipfile.close();
  }
}
