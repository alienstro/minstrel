export const AUDIO_STORE = Symbol('AUDIO_STORE');

export class TooLargeError extends Error {
  override name = 'TooLargeError';
}

// Spec §5.5 and §7.4. The bucket is private. The browser gets audio through signed URLs only.
export interface AudioStore {
  /** Streams the body to the key. Throws TooLargeError when the body passes maxBytes. */
  put(
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
    maxBytes: number,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  /** A URL that lasts 15 minutes. With downloadName, the URL sets Content-Disposition: attachment. */
  signedUrl(key: string, opts?: { downloadName?: string }): Promise<string>;
}
