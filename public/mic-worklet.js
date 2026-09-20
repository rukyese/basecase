// AudioWorklet processor: buffers mic frames and posts Float32Array chunks
// (~128ms) to the main thread, which resamples and forwards to the agent WS.
class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufs = [];
    this.len = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      this.bufs.push(ch.slice(0));
      this.len += ch.length;
      if (this.len >= 2048) {
        const merged = new Float32Array(this.len);
        let off = 0;
        for (const b of this.bufs) {
          merged.set(b, off);
          off += b.length;
        }
        this.port.postMessage(merged, [merged.buffer]);
        this.bufs = [];
        this.len = 0;
      }
    }
    return true;
  }
}

registerProcessor("mic-capture", MicCaptureProcessor);
