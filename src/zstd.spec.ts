import {describe, it, expect} from 'vitest'

import {ZstdDictDecoder} from "./zstd";
import wasmUrl from "./zstd_decompress.wasm?url";

describe('ZstdDictDecoder', () => {
  function initDecoder(dict: ArrayBuffer) {
    return ZstdDictDecoder.create(dict, '.' + wasmUrl);
  }

  // $ wget http://mattmahoney.net/dc/text8.zip
  // $ mkdir FullPathToTrainingSet
  // $ unzip text8.zip -d FullPathToTrainingSet
  // $ zstd -B1024 --train FullPathToTrainingSet/text8 -o dictionaryName --maxdict=1024
  // $ echo "This is a short sample text to be compressed." > file  # MUST use a file, not stdin
  // $ zstd -D dictionaryName -c file | base64
  const DICT = Buffer.from(`
N6Qw7DuXQicgENCSQjr//////8/5iSVtSxIQufduVm5C0t70/7/7f4IzAAAgUJgIcdlqOAAABKAT
mI3nFNJAymEKGUMIAAAAAAAAAAAAAAAAAAAAAOSKZAQkxLO5TB7NkiDHoZAphggAAAAAAQAAAAQA
AAAIAAAAdXQgdGhyb3VnaCBzdGF0ZSBpbnN0aXR1ZSBkaWZmZXJlbnQgYmFzZXMgZm9yIGV4YW1w
bGUgdHdvIHplcm8gc2V2ZW4gemVybyBzIGFuZCBpbmZvcm1hdGlvbiBhbmQgdGhlIGRldmVsb3Bt
ZW50IG9mIHN0YW5kYXJkc3BwIHRocmVlIGVpZ2h0IGZpdmUgdGhyZWUgbmluZSB0d28gZXh0ZXJu
YWwgbGlua3MgIGNvbW11bmljYXRpb24gYmV0d2VlbiB0aGUgZ292ZXJubWVudCBhbmQgdGhlIG90
aGVlIHVuaXZlcnNpdHkgb2YgYXVja2xhbmQgYW5kIG9uIHRoZSBpbnRlcm5hdGlvbmFsICB0aHJl
ZSB0aHJlZSB0d28gdHdvIGVpZ2h0IHR3byBzaXggdHdvIGZvdXIgdHdvIHplIGZvciB0aGUgaGlz
dG9yeSBvZiB0aGUgZnJlbmNoIGxhbmd1YWdlIHRoZSBtb3N0IGkgdHJhZGl0aW9uYWxseSB1c2Vk
IGJ5IHRoZSBuYXRpb25hbHMgb2YgdGhlIHN0YXRlIG8gb25lIHNldmVuIGZpdmUgb25lIG5pbmUg
Zm91ciBmb3VyIG9uZSBmb3VyIGZpdmUgZXIgZnJvbSB0aGUgYW1lcmljYW4gYXJ0IG5ld3Mgc3Rh
dGVkIHRoYXQgdGhlIGRhZGF0IGluY2x1ZGluZyB0aGUgdHdvIGZpdmUgb2YgdGhlIHBvcHVsYXRp
b24gdGhhdCBubyBpc2JuIHplcm8gbmluZSBzaXggb25lIGZpdmUgZm91ciBlaWdodCBmb3VyIHpl
cm8gIGVpZ2h0IHNldmVuIG9uZSB0d28gdGhyZWUgc2V2ZW4gZWlnaHQgbmluZSBoYXMgYSAgb25l
IG9uZSBmb3VyIHRocmVlIHplcm8gZml2ZSB0d28gc2V2ZW4gc2V2ZW4gdHdvICB3aXRoIHRoZSBl
bmdsaXNoIG11Y2ggdG8gdGhlIGNvbnN0ZXJuYXRpb24gb2YgdGhlbyB0d28gb25lIHNpeCB6ZXJv
IGZpdmUgZWlnaHQgdGhyZWUgb25lIHplcm8gZm91ciBlIG5pbmUgemVybyBvbmUgbmluZSBuaW5l
IHRocmVlIGFuZCB0aGUgZmlyc3QgcHJlc2QgaW4gdGhlIG9uZSBuaW5lIGZpdmUgemVybyBzIA==`, 'base64')
  const COMPRESSED = Buffer.from(`KLUv/Sc7l0InLhUBADOCBQpoATovPXfktK93nK9XEx8e53GmKQQC/MpAZvsDyESopNN0`, 'base64')

  it('should work on realistic data', async () => {
    const decoder = await initDecoder(DICT);

    const result = decoder.decode(COMPRESSED);

    expect(result).toEqual(Buffer.from(`The quick brown fox jumps over the lazy dog.`, 'utf8').buffer);
  })

  it('should error on invalid data', async () => {
    const decoder = await initDecoder(DICT);

    expect(() => decoder.decode(Buffer.from('invalid data'))).toThrowErrorMatchingInlineSnapshot('"Zstd ZSTD_getFrameContentSize: an error occurred (e.g. invalid magic number, srcSize too small)"')
  })

  it('should error on invalid dict', async () => {
    const decoder = await initDecoder(Buffer.from('invalid dict'));
    expect(() => decoder.decode(COMPRESSED)).toThrowErrorMatchingInlineSnapshot('"Zstd decode: expected dictId 0, got 658675515"')
  })
})
