// Procedural sound via ZzFX (ZzFXMicro, MIT — Frank Force). No audio files:
// every effect is generated from a parameter array at play time. We keep the
// canonical micro synth and add a small preset table + play helper.

const zzfxV = 0.3;                          // master volume
const zzfxR = 44100;                        // sample rate
const AC = window.AudioContext || window.webkitAudioContext;
const zzfxX = AC ? new AC() : null;

// Browsers start the context suspended until a user gesture; resume on first key.
addEventListener('keydown', () => { if (zzfxX && zzfxX.state !== 'running') zzfxX.resume(); });

function zzfxP(...samples) {
  const buffer = zzfxX.createBuffer(samples.length, samples[0].length, zzfxR);
  const source = zzfxX.createBufferSource();
  samples.map((d, i) => buffer.getChannelData(i).set(d));
  source.buffer = buffer;
  source.connect(zzfxX.destination);
  source.start();
  return source;
}

// Generate a sample buffer from ZzFX parameters.
function zzfxG(
  volume = 1, randomness = 0.05, frequency = 220, attack = 0, sustain = 0,
  release = 0.1, shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0,
  pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0,
  bitCrush = 0, delay = 0, sustainVolume = 1, decay = 0, tremolo = 0
) {
  const PI2 = Math.PI * 2, sign = (v) => v > 0 ? 1 : -1;
  let startSlide = slide *= 500 * PI2 / zzfxR / zzfxR,
    startFrequency = frequency *= (1 + randomness * 2 * Math.random() - randomness) * PI2 / zzfxR,
    b = [], t = 0, tm = 0, i = 0, j = 1, r = 0, c = 0, s = 0, f, length;

  attack = attack * zzfxR + 9;
  decay *= zzfxR;
  sustain *= zzfxR;
  release *= zzfxR;
  delay *= zzfxR;
  deltaSlide *= 500 * PI2 / zzfxR ** 3;
  modulation *= PI2 / zzfxR;
  pitchJump *= PI2 / zzfxR;
  pitchJumpTime *= zzfxR;
  repeatTime = repeatTime * zzfxR | 0;

  for (length = attack + decay + sustain + release + delay | 0; i < length; b[i++] = s) {
    if (!(++c % (bitCrush * 100 | 0))) {
      s = shape ? shape > 1 ? shape > 2 ? shape > 3 ?
        Math.sin((t % PI2) ** 3) :
        Math.max(Math.min(Math.tan(t), 1), -1) :
        1 - (2 * t / PI2 % 2 + 2) % 2 :
        1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2) :
        Math.sin(t);
      s = (repeatTime ? 1 - tremolo + tremolo * Math.sin(PI2 * i / repeatTime) : 1) *
        sign(s) * Math.abs(s) ** shapeCurve *
        volume * zzfxV * (
          i < attack ? i / attack :
          i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume) :
          i < attack + decay + sustain ? sustainVolume :
          i < length - delay ? (length - i - delay) / release * sustainVolume :
          0);
      s = delay ? s / 2 + (delay > i ? 0 :
        (i < length - delay ? 1 : (length - i) / delay) * b[i - delay | 0] / 2) : s;
    }
    f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++);
    t += f - f * noise * (1 - (Math.sin(i) + 1) * 1e9 % 2);
    if (j && ++j > pitchJumpTime) { frequency += pitchJump; startFrequency += pitchJump; j = 0; }
    if (repeatTime && !(++r % repeatTime)) { frequency = startFrequency; slide = startSlide; j = j || 1; }
  }
  return b;
}

// Preset parameter arrays, one per game event.
const P = [
  [1, , 300, , .05, .1, , 1.6, , , 160, .02],          // 0 JUMP   rising blip
  [1.2, , 90, , .03, .13, 4, 1.5, , , , , , .6],        // 1 LAND   soft thud
  [1, .1, 420, .01, .07, .16, 4, 2, , -120, , , , .35], // 2 DASH   whoosh
  [1.6, , 110, , .07, .22, 4, 2, , , -30, , , .6],      // 3 SLAM   heavy impact
  [.8, , 950, , .03, .08, , 1.5, 40, , , , , , , .05],  // 4 BLINK  zap
  [.5, , 620, , .02, .05, , 1.3],                       // 5 SWAP   soft tick
  [1, , 130, .01, .05, .22, 1, 1.5, -5, , , , , 1, , .1], // 6 HURT descending buzz
  [.9, , 523, , .12, .3, , 1.5, , , 280, .05, , , , , .1], // 7 GOAL chime
  [.7, , 520, , .04, .1, , 1.5, , , 220, .02],          // 8 DJUMP light double-jump blip
  [.8, , 180, .02, .1, .22, 2, 1, , , , , , .25, , .1], // 9 GRAV  warp
  [.7, .25, 1300, , .05, .16, 4, 1, , , , , , .5],      // 10 FREEZE crackle
  [.4, , 500, , .01, .06, , 1],                          // 11 STEP  soft page tick (story cards)
  [1.1, , 120, .1, .4, .6, , .5, -6, , , , , .2, , .1, , .6, , .1], // 12 OMEN Monochrome drone
  [1.4, .05, 330, .05, .35, .7, , 1.6, 50, , 300, .08, , , , , , , , .15], // 13 PRISM rising shimmer
  [.55, , 174, .2, .3, .8, , .6, , , , , , , , , , .6],  // 14 REVEAL low, melancholic
];

// Play a sound by index (see the constants below). Never throws — bad audio
// state must not break the game loop.
export function snd(i) {
  if (!zzfxX) return;
  try { zzfxP(zzfxG(...P[i])); } catch (e) { /* ignore */ }
}

export const S_JUMP = 0, S_LAND = 1, S_DASH = 2, S_SLAM = 3, S_BLINK = 4,
  S_SWAP = 5, S_HURT = 6, S_GOAL = 7, S_DJUMP = 8, S_GRAV = 9, S_FREEZE = 10,
  S_STEP = 11, S_OMEN = 12, S_PRISM = 13, S_REVEAL = 14;
