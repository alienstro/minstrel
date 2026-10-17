import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TooLargeError, type AudioStore } from './audio-store.js';

// Spec §7.4: stream and download URLs last 15 minutes.
const SIGNED_URL_SECONDS = 900;

export interface R2Env {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
}

export function r2EnvFromProcess(): R2Env {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be set');
  }
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET };
}

export function r2Client(env: R2Env): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    // R2 does not support all the default checksums of the SDK. Send a checksum only when the API needs one.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** A filename for Content-Disposition: an ASCII fallback and the UTF-8 name of RFC 6266. */
function attachmentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8 = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export class R2AudioStore implements AudioStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
    maxBytes: number,
  ): Promise<void> {
    let size = 0;
    let tooLarge = false;
    // Counts the bytes as they pass. The stream errors at the first chunk past the limit,
    // so the body never sits in memory as one buffer.
    const limited = body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;
          if (size > maxBytes) {
            tooLarge = true;
            controller.error(new TooLargeError(`The body passes ${maxBytes} bytes`));
            return;
          }
          controller.enqueue(chunk);
        },
      }),
    );

    // R2 aborts an incomplete multipart upload after 7 days, so a stopped upload leaves no object.
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: limited, ContentType: contentType },
    });
    try {
      await upload.done();
    } catch (error) {
      if (tooLarge) throw new TooLargeError(`The body passes ${maxBytes} bytes`);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<void> {
    let token: string | undefined;
    do {
      // A page holds no more than 1000 keys, which is also the DeleteObjects limit.
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (objects.length > 0) {
        const result = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        if (result.Errors?.length) {
          throw new Error(`R2 did not delete ${result.Errors.length} objects under ${prefix}`);
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  signedUrl(key: string, opts?: { downloadName?: string }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: opts?.downloadName
        ? attachmentDisposition(opts.downloadName)
        : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: SIGNED_URL_SECONDS });
  }
}
