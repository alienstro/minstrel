import {
  type AudioStore,
  TooLargeError,
} from '../../src/storage/audio-store.js';

export class FakeAudioStore implements AudioStore {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
    maxBytes: number,
  ): Promise<void> {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > maxBytes)
        throw new TooLargeError(`${key} is larger than ${maxBytes} bytes`);
      chunks.push(chunk);
    }
    this.objects.set(key, { body: Buffer.concat(chunks), contentType });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.objects.keys()])
      if (key.startsWith(prefix)) this.objects.delete(key);
  }

  async signedUrl(
    key: string,
    opts: { downloadName?: string } = {},
  ): Promise<string> {
    const download = opts.downloadName
      ? `&download=${encodeURIComponent(opts.downloadName)}`
      : '';
    return `https://r2.test/${key}?signed=1${download}`;
  }
}
