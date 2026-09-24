// Áudio procedural via WebAudio API: som de motor (sintetizado, sem samples
// de arquivo), efeitos sonoros curtos (cue) e bipes de contagem regressiva.
// Extraído 1:1 da classe original do bundle (nenhum valor foi alterado).

export class EngineAudio {
  constructor() {
    this.enabled = false;
    this.ready = false;
    this.gear = 1;
    this.nextShift = 0;
  }

  /** Ativa/desativa o áudio. Cria o grafo de WebAudio na primeira vez. */
  async enable(on) {
    this.enabled = on;
    if (!on) return;
    if (!this.ready) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        this.enabled = false;
        return;
      }
      this.ctx = new AudioCtx();
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.master.gain.value = .24;
      this.master.connect(ctx.destination);

      // Corpo do som de motor: 3 osciladores em harmônicos (1x, 2.01x, 3.02x)
      // passando por um filtro passa-baixa, para simular o "rosnado" do motor.
      this.engine = ctx.createGain();
      this.engine.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 1500;
      this.engine.connect(engineFilter).connect(this.master);

      this.voices = [1, 2.01, 3.02].map((ratio) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = ratio === 1 ? "sawtooth" : "triangle";
        gain.gain.value = ratio === 1 ? .5 : .16;
        osc.connect(gain).connect(this.engine);
        osc.start();
        return { o: osc, ratio };
      });

      // Ruído branco para o som de pneus derrapando (drift).
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
      this.noiseBuffer = noiseBuffer;

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;
      const tireFilter = ctx.createBiquadFilter();
      tireFilter.type = "bandpass";
      tireFilter.frequency.value = 1500;
      tireFilter.Q.value = 2;
      this.tires = ctx.createGain();
      this.tires.gain.value = 0;
      noiseSource.connect(tireFilter).connect(this.tires).connect(this.master);
      noiseSource.start();

      this.ready = true;
    }
    await this.ctx.resume();
  }

  /** Toca uma nota curta simples (bipe). */
  tone(freq, dur = .12, type = "sine", vol = .22) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** Toca um efeito sonoro nomeado (impacto, chegada, turbo, item, escudo, míssil...). */
  cue(name) {
    if (!this.ready || !this.enabled) return;
    if (name === "impact") {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      src.buffer = this.noiseBuffer;
      filter.type = "lowpass";
      filter.frequency.value = 350;
      gain.gain.setValueAtTime(.65, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .28);
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      src.stop(ctx.currentTime + .3);
      return;
    }
    const notes =
      name === "finish" ? [523, 659, 784, 1047]
      : name === "boost" ? [330, 660, 990]
      : name === "pickup" ? [660, 880]
      : name === "shield" ? [430, 860]
      : name === "missile" ? [180, 280]
      : [240];
    notes.forEach((freq, i) => setTimeout(() => this.tone(freq, .18, "triangle", .24), i * 85));
  }

  /** Atualiza o som do motor a cada frame com base no estado do carro do jogador. */
  update(car, engineOn, isDrifting) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const running = this.enabled && engineOn;
    const gear = Math.max(1, Math.min(8, Math.floor(car.speed * 3.6 / 43) + 1));
    if (gear !== this.gear && running) {
      this.nextShift = ctx.currentTime + .07;
      this.gear = gear;
      this.tone(110, .04, "triangle", .12);
    }
    const baseFreq = 120 + (car.speed * 3.6 - (gear - 1) * 43) * 2.6;
    for (const voice of this.voices) {
      voice.o.frequency.setTargetAtTime(baseFreq * voice.ratio, ctx.currentTime, .06);
    }
    this.engine.gain.setTargetAtTime(
      running ? (ctx.currentTime < this.nextShift ? .015 : .055 + car.speed * .001) : 0,
      ctx.currentTime, .05
    );
    this.tires.gain.setTargetAtTime(running && isDrifting ? .13 : 0, ctx.currentTime, .05);
  }
}

/** Instância única compartilhada por todo o jogo. */
export const engineAudio = new EngineAudio();

/** Bipe simples de UI/contagem regressiva (atalho usado pelo loop principal). */
export function beep(freq = 550, dur = .1) {
  engineAudio.tone(freq, dur);
}

/** Aplica o estado atual de `state.soundOn` ao motor de áudio (liga/desliga). */
export function syncEngineAudioEnabled(soundOn) {
  return engineAudio.enable(soundOn);
}
