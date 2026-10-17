import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { TooLargeError } from './audio-store.js';
import { R2AudioStore, r2Client } from './r2-audio-store.js';

const client = r2Client({
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'minstrel',
});
const s3 = mockClient(client);
const store = new R2AudioStore(client, 'minstrel');

function streamOf(...chunks: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const size of chunks) controller.enqueue(new Uint8Array(size));
      controller.close();
    },
  });
}

beforeEach(() => {
  s3.reset();
});

describe('R2AudioStore', () => {
  it('put streams a body under maxBytes with its type', async () => {
    s3.on(PutObjectCommand).resolves({});

    await store.put('users/u1/tracks/t1.mp3', streamOf(10, 10), 'audio/mpeg', 20);

    const input = s3.commandCalls(PutObjectCommand)[0]!.args[0].input;
    expect(input).toMatchObject({
      Bucket: 'minstrel',
      Key: 'users/u1/tracks/t1.mp3',
      ContentType: 'audio/mpeg',
    });
  });

  it('put stops a stream over maxBytes', async () => {
    s3.on(PutObjectCommand).resolves({});

    await expect(
      store.put('users/u1/tracks/t1.mp3', streamOf(10, 10, 10), 'audio/mpeg', 15),
    ).rejects.toBeInstanceOf(TooLargeError);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it('signedUrl expires in 900 s', async () => {
    const url = new URL(await store.signedUrl('users/u1/tracks/t1.mp3'));

    expect(url.host).toBe('minstrel.acct.r2.cloudflarestorage.com');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('response-content-disposition')).toBeNull();
  });

  it('a download URL has the attachment disposition', async () => {
    const url = new URL(
      await store.signedUrl('users/u1/tracks/t1.mp3', { downloadName: 'Café "Night".mp3' }),
    );

    expect(url.searchParams.get('response-content-disposition')).toBe(
      `attachment; filename="Caf_ _Night_.mp3"; filename*=UTF-8''Caf%C3%A9%20%22Night%22.mp3`,
    );
  });

  it('deletePrefix deletes each listed object', async () => {
    s3.on(ListObjectsV2Command, { ContinuationToken: undefined })
      .resolves({
        Contents: [{ Key: 'users/u1/a.mp3' }, { Key: 'users/u1/b.jpg' }],
        IsTruncated: true,
        NextContinuationToken: 'next',
      })
      .on(ListObjectsV2Command, { ContinuationToken: 'next' })
      .resolves({ Contents: [{ Key: 'users/u1/c.wav' }], IsTruncated: false });
    s3.on(DeleteObjectsCommand).resolves({});

    await store.deletePrefix('users/u1/');

    const listed = s3.commandCalls(ListObjectsV2Command).map((c) => c.args[0].input.Prefix);
    expect(listed).toEqual(['users/u1/', 'users/u1/']);
    const deleted = s3
      .commandCalls(DeleteObjectsCommand)
      .flatMap((c) => c.args[0].input.Delete!.Objects!.map((o) => o.Key));
    expect(deleted).toEqual(['users/u1/a.mp3', 'users/u1/b.jpg', 'users/u1/c.wav']);
  });
});
