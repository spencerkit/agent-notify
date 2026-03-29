import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const sampleRate = 44100;

const themes = [
  {
    name: "subtle",
    sounds: {
      needs_input: [{ type: "tone", frequency: 554.37, durationMs: 120, amplitude: 0.18 }],
      completed: [{ type: "tone", frequency: 659.25, durationMs: 110, amplitude: 0.16 }],
      failed: [{ type: "tone", frequency: 392.0, durationMs: 180, amplitude: 0.2 }]
    }
  },
  {
    name: "standard",
    sounds: {
      needs_input: [{ type: "tone", frequency: 739.99, durationMs: 160, amplitude: 0.3 }],
      completed: [{ type: "tone", frequency: 880.0, durationMs: 130, amplitude: 0.26 }],
      failed: [
        { type: "tone", frequency: 440.0, durationMs: 110, amplitude: 0.3 },
        { type: "silence", durationMs: 40 },
        { type: "tone", frequency: 349.23, durationMs: 150, amplitude: 0.32 }
      ]
    }
  },
  {
    name: "urgent",
    sounds: {
      needs_input: [
        { type: "tone", frequency: 987.77, durationMs: 170, amplitude: 0.38 },
        { type: "silence", durationMs: 35 },
        { type: "tone", frequency: 987.77, durationMs: 120, amplitude: 0.32 }
      ],
      completed: [{ type: "tone", frequency: 1174.66, durationMs: 160, amplitude: 0.34 }],
      failed: [
        { type: "tone", frequency: 329.63, durationMs: 140, amplitude: 0.42 },
        { type: "silence", durationMs: 50 },
        { type: "tone", frequency: 329.63, durationMs: 180, amplitude: 0.46 }
      ]
    }
  }
];

await mkdir("assets/themes", { recursive: true });

for (const theme of themes) {
  for (const [state, segments] of Object.entries(theme.sounds)) {
    const samples = renderSamples(segments);
    const wav = renderWav(samples);
    const outputPath = join("assets", "themes", `${theme.name}-${state}.wav`);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, wav);
  }
}

function renderSamples(segments) {
  const samples = [];

  for (const segment of segments) {
    const frameCount = Math.round((sampleRate * segment.durationMs) / 1000);

    if (segment.type === "silence") {
      for (let index = 0; index < frameCount; index += 1) {
        samples.push(0);
      }
      continue;
    }

    for (let index = 0; index < frameCount; index += 1) {
      const t = index / sampleRate;
      const envelope = Math.sin((Math.PI * index) / frameCount);
      samples.push(
        Math.sin(2 * Math.PI * segment.frequency * t) * segment.amplitude * envelope
      );
    }
  }

  return samples;
}

function renderWav(samples) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * bytesPerSample);
  }

  return buffer;
}
