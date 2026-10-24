// zstd compression for the plugin's data files (decoded by ruzstd in src/lib.rs)
const zlib = require('zlib');
const level = { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } };
exports.compress = buf => zlib.zstdCompressSync(buf, level);
exports.decompress = buf => zlib.zstdDecompressSync(buf);

// CLI: node tools/zstd.js <input> <output>
if (require.main === module) {
  const fs = require('fs');
  const [input, output] = process.argv.slice(2);
  const out = exports.compress(fs.readFileSync(input));
  fs.writeFileSync(output, out);
  console.error(`${input} -> ${output}: ${(out.length / 1e6).toFixed(2)} MB`);
}
