import {mapRangeToCompressed} from './compressedFile';
import {describe, it, expect} from "vitest";

describe('CompressedFile', () => {
  const partIndex = new Uint32Array([50, 100, 150, 200, 500]);
  const chunkSize = 100;

  it('should map range correctly', () => {
    expect(mapRangeToCompressed({fromByte: 0, toByte: 99, partIndex, chunkSize})).toEqual({from: 0, to: 50});
    expect(mapRangeToCompressed({fromByte: 0, toByte: 199, partIndex, chunkSize})).toEqual({from: 0, to: 100});
    expect(mapRangeToCompressed({fromByte: 200, toByte: 299, partIndex, chunkSize})).toEqual({from: 100, to: 150});
  })

  it('should fail if invalid values are passed', () => {
    expect(() => mapRangeToCompressed({
      fromByte: 0, toByte: 120, partIndex, chunkSize
    })).toThrowErrorMatchingInlineSnapshot('"toByte=121 must be a multiple of chunkSize=100"')
    expect(() => mapRangeToCompressed({
      fromByte: 999, toByte: 999, partIndex, chunkSize
    })).toThrowErrorMatchingInlineSnapshot('"fromByte=999 must be a multiple of chunkSize=100"')

    expect(() => mapRangeToCompressed({
      fromByte: 0, toByte: 999, partIndex, chunkSize
    })).toThrowErrorMatchingInlineSnapshot('"toByte=1000 is out of bounds (max=500)"')
    expect(() => mapRangeToCompressed({
      fromByte: 0, toByte: 501, partIndex, chunkSize
    })).toThrowErrorMatchingInlineSnapshot('"toByte=502 must be a multiple of chunkSize=100"')

    expect(() => mapRangeToCompressed({
      fromByte: 0, toByte: 0, partIndex: new Uint32Array([]), chunkSize
    })).toThrowErrorMatchingInlineSnapshot('"partIndex (0) must have at least 1 elements"')
  })
});
