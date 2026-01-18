const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

class ContextCompressor {
  static compress(data) {
    const json = JSON.stringify(data);
    return zlib.gzipSync(Buffer.from(json, 'utf8'));
  }

  static decompress(buffer) {
    const decompressed = zlib.gunzipSync(buffer);
    return JSON.parse(decompressed.toString('utf8'));
  }

  static async saveCompressed(data, filePath) {
    const compressed = this.compress(data);
    await fs.promises.writeFile(filePath, compressed);
  }

  static loadCompressed(filePath) {
    const compressed = fs.readFileSync(filePath);
    return this.decompress(compressed);
  }

  static getCompressedPath(originalPath) {
    return originalPath.replace(/\.(json|md)$/, '.gz');
  }

  static async compressFile(inputPath, outputPath) {
    const data = JSON.parse(await fs.promises.readFile(inputPath, 'utf8'));
    await this.saveCompressed(data, outputPath);
  }

  static getSizeInfo(filePath) {
    if (!fs.existsSync(filePath)) return null;
    
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath);
    const compressed = zlib.gzipSync(content);
    
    return {
      originalBytes: stats.size,
      compressedBytes: compressed.length,
      compressionRatio: ((1 - compressed.length / content.length) * 100).toFixed(1)
    };
  }
}

module.exports = ContextCompressor;
