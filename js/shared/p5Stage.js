import p5 from 'p5';

// Wraps a p5.js sketch (instance mode) so the main loop can drive it frame by frame.
// `draw(p, time, dt)` is called once per frame; draw in CSS pixels (p.width × p.height).
export function createP5Stage(ctx, { setup, draw }) {
  let ready = false;
  let size = { w: 100, h: 100, dpr: 1 };
  let t = 0, dt = 0;

  const p = new p5((s) => {
    s.setup = () => {
      s.createCanvas(size.w, size.h);
      s.pixelDensity(size.dpr);
      s.noLoop();
      setup?.(s);
      ready = true;
    };
    s.draw = () => { if (ready) draw(s, t, dt); };
  }, ctx.container);

  return {
    p,
    resize(w, h, dpr) {
      size = { w, h, dpr };
      if (!ready) return;
      p.pixelDensity(dpr);
      p.resizeCanvas(w, h, true);
    },
    frame(time, delta) {
      if (!ready) return;
      t = time; dt = delta;
      p.redraw();
    },
    dispose() { p.remove(); },
  };
}
