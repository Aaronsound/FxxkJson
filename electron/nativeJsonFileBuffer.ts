const MINIMUM_GROWTH_CAPACITY = 1024 * 1024;

function normalizeExpectedByteLength(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Native JSON file size must be a non-negative safe integer');
  }

  return value;
}

function getNextCapacity(currentCapacity: number, minimumCapacity: number) {
  let capacity = Math.max(currentCapacity, MINIMUM_GROWTH_CAPACITY);
  while (capacity < minimumCapacity) {
    capacity = Math.max(minimumCapacity, capacity * 2);
  }
  return capacity;
}

export class NativeJsonFileBuffer {
  private bytes: Uint8Array;
  private byteLength = 0;

  constructor(expectedByteLength: number) {
    this.bytes = new Uint8Array(normalizeExpectedByteLength(expectedByteLength));
  }

  append(chunk: Uint8Array) {
    const requiredCapacity = this.byteLength + chunk.byteLength;
    if (!Number.isSafeInteger(requiredCapacity)) {
      throw new RangeError('Native JSON file is too large to buffer safely');
    }

    if (requiredCapacity > this.bytes.byteLength) {
      const grown = new Uint8Array(getNextCapacity(this.bytes.byteLength, requiredCapacity));
      grown.set(this.bytes.subarray(0, this.byteLength));
      this.bytes = grown;
    }

    this.bytes.set(chunk, this.byteLength);
    this.byteLength = requiredCapacity;
  }

  finish() {
    const completedBytes = this.bytes.subarray(0, this.byteLength);
    const text = new TextDecoder().decode(completedBytes);
    this.release();
    return text;
  }

  release() {
    this.bytes = new Uint8Array(0);
    this.byteLength = 0;
  }
}
