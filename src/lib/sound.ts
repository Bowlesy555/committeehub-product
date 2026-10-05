let ctx: AudioContext | null = null;

/** A short two-tone "ding", generated on the fly -- no audio file to host. */
export function playNotificationSound() {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    [[880, 0], [1320, 0.09]].forEach(([freq, delay]) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.15, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.2);
    });
  } catch {
    // Audio can fail for all sorts of environment reasons (autoplay policy,
    // no audio device, etc.) -- never let a notification sound crash the app.
  }
}
