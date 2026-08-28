import React, { useCallback, useEffect, useRef } from 'react';

/**
 * A freehand pen layer over the postcard frame. Only own layer,
 * separate from `PostcardCanvas`'s pan/sticker-drag handling, active
 * only in draw mode -- see `App.jsx`'s `drawMode` toggle -- so a pen
 * stroke and a pan gesture never fight over the same pointer events.
 *
 * Points are stored normalized (0..1 within this layer's own box), the
 * same convention as sticker `x`/`y`, so a stroke drawn at preview size
 * lands in the same place on the full-resolution export canvas in
 * `export.js`.
 */
export default function DoodleLayer({ strokes, drawMode, strokeColor, strokeWidth, onAddStroke }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingRef = useRef(null); // { points: [{x,y}] } while a stroke is in progress

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const allStrokes = drawingRef.current ? [...strokes, drawingRef.current] : strokes;
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width * (canvas.width / 100);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        const x = p.x * canvas.width;
        const y = p.y * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [strokes]);

  // Keeps the canvas's pixel buffer matching its displayed box -- a plain
  // CSS 100%/100% canvas defaults to a 300x150 buffer stretched by the
  // browser, which would blur every stroke.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    // Resizing the canvas inside the observer's own callback can trigger
    // a layout change within the same observation cycle, which Chrome
    // reports as "ResizeObserver loop completed with undelivered
    // notifications" -- benign per spec, but webpack's dev overlay treats
    // it as an uncaught error and blocks the whole page. Deferring the
    // actual resize to the next frame breaks that synchronous loop.
    let frame = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const rect = container.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        redraw();
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [redraw]);

  useEffect(redraw, [redraw]);

  const toNormalized = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e) => {
    if (!drawMode) return;
    // This layer sits inside `.postcard-frame`, which has its own
    // onPointerDown/Move/Up for panning the photo. Without stopping
    // propagation here, the very same gesture that draws a stroke also
    // bubbles up and pans the photo underneath it at the same time --
    // exactly the "picture moves while drawing" bug this fixes.
    // `StickerOverlay` in `PostcardOverlay.jsx` already does this for
    // the identical reason; this layer had simply been missing it.
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = { color: strokeColor, width: strokeWidth, points: [toNormalized(e)] };
    redraw();
  };

  const onPointerMove = (e) => {
    if (!drawMode || !drawingRef.current) return;
    e.stopPropagation();
    drawingRef.current.points.push(toNormalized(e));
    redraw();
  };

  const onPointerUp = (e) => {
    if (!drawMode || !drawingRef.current) return;
    e.stopPropagation();
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (stroke.points.length > 1) onAddStroke(stroke);
    else redraw();
  };

  return (
    <div
      ref={containerRef}
      className="doodle-layer"
      style={{ pointerEvents: drawMode ? 'auto' : 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
