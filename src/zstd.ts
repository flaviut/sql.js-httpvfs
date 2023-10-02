import ZstdInit from './zstd_decompress';
import wasmUrl from "./zstd_decompress.wasm?url";

wasmUrl;

// from https://github.com/kig/zstd-emscripten/, with zstd v1.5.5
// [TODO] update to latest
// diff --git a/exported_functions_decompress.txt b/exported_functions_decompress.txt
// index 895f5fc..61d6a36 100644
// --- a/exported_functions_decompress.txt
// +++ b/exported_functions_decompress.txt
// @@ -1,6 +1,13 @@
// -_ZSTD_createDStream
// -_ZSTD_freeDStream
// -_ZSTD_initDStream
// -_ZSTD_DStreamInSize
// -_ZSTD_DStreamOutSize
// -_ZSTD_decompressStream_simpleArgs
// +_free
// +_malloc
// +_ZSTD_createDCtx
// +_ZSTD_createDDict
// +_ZSTD_decompressDCtx
// +_ZSTD_decompress_usingDDict
// +_ZSTD_freeDCtx
// +_ZSTD_freeDDict
// +_ZSTD_getDictID_fromDDict
// +_ZSTD_getDictID_fromFrame
// +_ZSTD_getErrorName
// +_ZSTD_getFrameContentSize
// +_ZSTD_isError
// diff --git a/zstd b/zstd
// index c2c6a4a..63779c7 160000
// --- a/zstd
// +++ b/zstd
// @@ -1 +1 @@
// -Subproject commit c2c6a4ab40fcc327e79d5364f9c2ab1e41e6a7f8
// +Subproject commit 63779c798237346c2b245c546c40b72a5a5913fe

interface ZstdModule {
  HEAPU8: Uint8Array,
  HEAPU32: Uint32Array,
  _ZSTD_decompress_usingDDict: (dctx: number, dst: number, dstCapacity: number, src: number, srcSize: number, ddict: number) => number,
  _ZSTD_createDDict: (dictBuffer: number, dictSize: number) => number,
  _ZSTD_freeDDict: (ddict: number) => void,
  _ZSTD_isError: (code: number) => number,
  _ZSTD_getErrorName: (code: number) => number,
  _ZSTD_createDCtx: () => number,
  _ZSTD_freeDCtx: (dctx: number) => number,
  _ZSTD_decompressDCtx: (dctx: number, dst: number, dstCapacity: number, src: number, srcSize: number) => number,
  _ZSTD_getFrameContentSize: (src: number, srcSize: number) => number,
  _ZSTD_getDictID_fromFrame: (src: number, srcSize: number) => number,
  _ZSTD_getDictID_fromDDict: (ddict: number) => number,

  _malloc: (size: number) => number,
  _free: (ptr: number) => void,
}


export class ZstdDictDecoder {
  private Module: ZstdModule;
  private ddictPtr: number;
  private dctxPtr: number;

  /**
   * @param dictBuffer buffer containing the dictionary to use for decompression, and nothing else
   * @param wasmUrl url to the wasm file
   */
  static async create(dictBuffer: ArrayBuffer, wasmUrl: string): Promise<ZstdDictDecoder> {
    const Module = await ZstdInit({
      locateFile: (_file: string) => wasmUrl,
    }) as ZstdModule;

    const dictPtr = Module._malloc(dictBuffer.byteLength);
    Module.HEAPU8.set(new Uint8Array(dictBuffer), dictPtr);
    const ddictPtr = Module._ZSTD_createDDict(dictPtr, dictBuffer.byteLength);
    Module._free(dictPtr);
    const dctxPtr = Module._ZSTD_createDCtx();

    return new ZstdDictDecoder({
      Module,
      ddictPtr,
      dctxPtr,
    });
  }

  private constructor(config: {
    Module: ZstdModule,
    ddictPtr: number,
    dctxPtr: number,
  }) {
    this.Module = config.Module;
    this.ddictPtr = config.ddictPtr;
    this.dctxPtr = config.dctxPtr;
  }

  private handleZstdError(result: number, context: string, free: () => void = () => {
  }): number {
    const Module = this.Module;
    if (Module._ZSTD_isError(result)) {
      free();
      const errorPtr = Module._ZSTD_getErrorName(result);
      const errorBuffer = new Uint8Array(Module.HEAPU8.slice(errorPtr, errorPtr + 100).buffer);
      // find the first null byte
      const errorStr = String.fromCharCode(...errorBuffer.slice(0, errorBuffer.indexOf(0)));
      throw new Error(`Zstd ${context}: ${errorStr}`);
    }
    return result;
  }

  /**
   * @param compressedBuffer buffer containing the compressed data
   * @returns a buffer containing the uncompressed data
   */
  decode(compressedBuffer: ArrayBuffer): ArrayBuffer {
    const Module = this.Module;
    const compressedPtr = Module._malloc(compressedBuffer.byteLength);
    Module.HEAPU8.set(new Uint8Array(compressedBuffer), compressedPtr);

    /* Read the content size from the frame header. For simplicity we require
     * that it is always present. By default, zstd will write the content size
     * in the header when it is known. If you can't guarantee that the frame
     * content size is always written into the header, either use streaming
     * decompression, or ZSTD_decompressBound().
     */
    const frameContentSize = Module._ZSTD_getFrameContentSize(compressedPtr, compressedBuffer.byteLength)
    if (frameContentSize === -1) {
      Module._free(compressedPtr);
      throw new Error(`Zstd ZSTD_getFrameContentSize: the size cannot be determined`);
    } else if (frameContentSize === -2) {
      Module._free(compressedPtr);
      throw new Error(`Zstd ZSTD_getFrameContentSize: an error occurred (e.g. invalid magic number, srcSize too small)`);
    } else if (frameContentSize === 0) {
      Module._free(compressedPtr);
      throw new Error(`Zstd ZSTD_getFrameContentSize: the frame is empty`);
    }

    /* Check that the dictionary ID matches.
     * If a non-zstd dictionary is used, then both will be zero.
     * By default zstd always writes the dictionary ID into the frame.
     * Zstd will check if there is a dictionary ID mismatch as well.
     */

    const expectedDictId = this.handleZstdError(
      Module._ZSTD_getDictID_fromDDict(this.ddictPtr),
      'getDictID_fromDDict',
      () => Module._free(compressedPtr),
    );
    const actualDictId = this.handleZstdError(
      Module._ZSTD_getDictID_fromFrame(compressedPtr, compressedBuffer.byteLength),
      'getDictID_fromFrame',
      () => Module._free(compressedPtr),
    );
    if (expectedDictId !== actualDictId) {
      Module._free(compressedPtr);
      throw new Error(`Zstd decode: expected dictId ${expectedDictId}, got ${actualDictId}`);
    }

    const uncompressedPtr = Module._malloc(frameContentSize);
    this.handleZstdError(
      Module._ZSTD_decompress_usingDDict(
        this.dctxPtr,
        uncompressedPtr,
        frameContentSize,
        compressedPtr,
        compressedBuffer.byteLength,
        this.ddictPtr,
      ),
      'decompress_usingDDict',
      () => {
        Module._free(compressedPtr);
        Module._free(uncompressedPtr);
      })

    Module._free(compressedPtr);

    const uncompressedBuffer = Module.HEAPU8.slice(uncompressedPtr, uncompressedPtr + frameContentSize).buffer;
    Module._free(uncompressedPtr);

    return uncompressedBuffer;
  }

  destroy() {
    this.Module._ZSTD_freeDDict(this.ddictPtr);
  }
}
