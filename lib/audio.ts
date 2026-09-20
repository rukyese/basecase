// Audio helpers for the Deepgram Voice Agent loop.
// Mic side: browser AudioContext (usually 44.1k/48k Float32) -> linear16 16kHz.
// Playback side: linear16 16kHz chunks -> scheduled AudioBuffers (Web Audio
// resamples to the hardware rate automatically).

export const AGENT_SAMPLE_RATE = 16000;

// Linear-interpolation resampler that keeps fractional phase across chunks so
// boundaries stay smooth.
export class LinearResampler {
  private pending = new Float32Array(0);
  private pos = 0;

  constructor(
    private fromRate: number,
    private toRate: number
  ) {}

  push(chunk: Float32Array): Float32Array {
    const merged = new Float32Array(this.pending.length + chunk.length);
    merged.set(this.pending);
    merged.set(chunk, this.pending.length);

    const ratio = this.fromRate / this.toRate;
    const outLen = Math.floor((merged.length - 1 - this.pos) / ratio);
    if (outLen <= 0) {
      this.pending = merged;
      return new Float32Array(0);
    }

    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const idx = this.pos + i * ratio;
      const i0 = Math.floor(idx);
      const frac = idx - i0;
      out[i] = merged[i0] * (1 - frac) + merged[i0 + 1] * frac;
    }

    this.pos += outLen * ratio;
    const consumed = Math.floor(this.pos);
    this.pos -= consumed;
    this.pending = merged.slice(consumed);
    return out;
  }
}

export function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

// Queues incoming linear16 PCM chunks and schedules them back-to-back for
// gapless playback. stop() implements barge-in: drops everything pending.
export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  enqueue(bytes: ArrayBuffer, sampleRate = AGENT_SAMPLE_RATE) {
    const ctx = this.ensureCtx();
    // chunks can split mid-sample; drop a trailing odd byte
    const pcm = new Int16Array(bytes.slice(0, bytes.byteLength - (bytes.byteLength % 2)));
    if (pcm.length === 0) return;
    const f32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 0x8000;

    const buf = ctx.createBuffer(1, f32.length, sampleRate);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const t = Math.max(ctx.currentTime + 0.04, this.nextTime);
    src.start(t);
    this.nextTime = t + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  close() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
