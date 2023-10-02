import {createLazyFile, LazyFileConfig} from "./lazyFile";
import {ZstdDictDecoder} from "./zstd";

function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export async function createLazyCompressedFile(
  FS: any,
  parent: string,
  name: string,
  canRead: boolean,
  canWrite: boolean,
  lazyFileConfig: LazyFileConfig & {
    zstdWasmUrl: string,
  }
) {
  const url = lazyFileConfig.rangeMapper(0, 0).url;
  const indexUrl = url + '.zstindex';
  const {dictionary, partIndex} = parseZstIndex(await (await fetch(indexUrl)).arrayBuffer());
  const decoder = await ZstdDictDecoder.create(dictionary, lazyFileConfig.zstdWasmUrl);

  return createLazyFile(
    FS,
    parent,
    name,
    canRead,
    canWrite,
    {
      ...lazyFileConfig,
      rangeMapper(fromByte, toByte) {
        const compressedRange = mapRangeToCompressed({
          fromByte,
          toByte,
          partIndex,
          chunkSize: lazyFileConfig.requestChunkSize
        });
        return {
          ...lazyFileConfig.rangeMapper(compressedRange.from, compressedRange.to),

        };
      },
      responseMapper(response: ArrayBuffer, fileRange: {
        absoluteFrom: number,
        absoluteTo: number
      }) {
        if (fileRange.absoluteFrom === fileRange.absoluteTo) {
          return new ArrayBuffer(0);
        }

        const chunkSize = lazyFileConfig.requestChunkSize
        // convert inclusive range to exclusive range
        fileRange.absoluteTo += 1;

        assert(fileRange.absoluteFrom % chunkSize === 0, 'fromByte must be a multiple of chunkSize');
        assert(fileRange.absoluteTo % chunkSize === 0, 'toByte must be a multiple of chunkSize');

        const fromChunk = fileRange.absoluteFrom / chunkSize;
        const toChunk = fileRange.absoluteTo / chunkSize;
        const numChunks = toChunk - fromChunk;
        // decompress chunks one-by-one
        const decompressed = new Uint8Array(numChunks * chunkSize);
        let offset = 0;
        for (let i = 0; i < numChunks; i++) {
          const compressedSize = partIndex[i + fromChunk] - (i === 0 ? 0 : partIndex[i + fromChunk - 1])
          const compressed = response.slice(offset, offset + compressedSize);

          const decompressedChunk = decoder.decode(compressed);
          decompressed.set(new Uint8Array(decompressedChunk), i * chunkSize);
          offset += compressedSize;
        }
        assert(fileRange.absoluteTo - fileRange.absoluteFrom === decompressed.length,
          `decompressed.length=${decompressed.length} must be equal to absoluteRange=${fileRange.absoluteTo - fileRange.absoluteFrom}`);
        return decompressed.buffer;
      }
    },
  )
}


export function parseZstIndex(buffer: ArrayBuffer): {
  dictionary: ArrayBuffer,
  partIndex: Uint32Array
} {
  const MAGIC_NUMBERS = new Uint32Array(
    new BigUint64Array([
      BigInt('0x0f4b462afc1e47fc'),
      BigInt('0xb6ee9b384955469b')
    ]).buffer);

  const magicNumbers = new Uint32Array(buffer, 0, MAGIC_NUMBERS.length);
  if (magicNumbers.some((v, i) => v !== MAGIC_NUMBERS[i])) {
    throw new Error('Invalid magic numbers, expected ' + MAGIC_NUMBERS.join(', ') + ', got ' + magicNumbers.join(', '))
  }

  const DICTIONARY_SIZE = 64 * 1024;
  const DICTIONARY_OFFSET = MAGIC_NUMBERS.length * MAGIC_NUMBERS.BYTES_PER_ELEMENT;
  const INDEX_OFFSET = DICTIONARY_OFFSET + DICTIONARY_SIZE;

  return {
    dictionary: buffer.slice(DICTIONARY_OFFSET, DICTIONARY_OFFSET + DICTIONARY_SIZE),
    partIndex: new Uint32Array(buffer.slice(INDEX_OFFSET)),
  }
}

/**
 * `[fromByte, toByte]` is an inclusive range
 * `{from, to}` is an inclusive range
 *
 */
export function mapRangeToCompressed(
  {fromByte, toByte, partIndex, chunkSize}: {
    fromByte: number,
    toByte: number,
    partIndex: Uint32Array,
    chunkSize: number
  }): {
  from: number,
  to: number
} {
  // convert inclusive range to exclusive range
  if (toByte !== 0 && toByte !== fromByte) {
    toByte += 1;
  }

  assert(fromByte % chunkSize === 0, `fromByte=${fromByte} must be a multiple of chunkSize=${chunkSize}`);
  assert(toByte % chunkSize === 0, `toByte=${toByte} must be a multiple of chunkSize=${chunkSize}`);
  assert(fromByte <= toByte, `fromByte=${fromByte} must be less than toByte=${toByte}`);
  assert(fromByte >= 0, `fromByte=${fromByte} must be positive`);
  assert(partIndex.length >= 1, `partIndex (${partIndex.length}) must have at least 1 elements`)
  assert(toByte <= partIndex[partIndex.length - 1], `toByte=${toByte} is out of bounds (max=${partIndex[partIndex.length - 1]})`);

  const fromChunk = fromByte / chunkSize - 1;
  const toChunk = toByte / chunkSize - 1;

  return {
    from: fromChunk <= 0 ? 0 : partIndex[fromChunk],
    to: partIndex[toChunk],
  }
}
