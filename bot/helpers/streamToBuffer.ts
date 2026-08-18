type AudioChunk = Uint8Array<ArrayBufferLike>;
type ReaderStream = {
  getReader(): {
    read(): Promise<{ done: boolean; value?: AudioChunk }>;
    releaseLock(): void;
  };
};

export default async function streamToBuffer(
  stream: ReaderStream | AsyncIterable<AudioChunk>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  if (!stream) {
    throw new Error("Cannot read audio stream from ElevenLabs response.");
  }

  if (Symbol.asyncIterator in stream) {
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}
