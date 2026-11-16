import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './WritingPad.css';

export type Point = { x: number; y: number; pressure: number; time: number };
export type Stroke = Point[];

export interface WritingPadHandle {
  clear(): void;
  undo(): void;
  getImageData(): ImageData | null;
  getStrokes(): Stroke[];
  isEmpty(): boolean;
}

interface WritingPadProps {
  onChange(strokes: Stroke[]): void;
  guidePaths?: string[];
  showGuide?: boolean;
  pencilOnly?: boolean;
  disabled?: boolean;
}

/** Vector points are in 0..1 canvas coordinates, so resizing never erases ink. */
function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, size: number, solid: boolean) {
  if (!stroke.length) return;
  ctx.strokeStyle = solid ? '#000' : '#293735';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Normalize export thickness independently of Pencil pressure. Very thin
  // lines can disappear when the classifier resizes its input to 64 pixels.
  const width = (pressure: number) => solid ? size * 0.025 : size * 0.0135 * (0.8 + pressure * 0.5);
  if (stroke.length === 1) {
    ctx.beginPath();
    ctx.arc(stroke[0].x * size, stroke[0].y * size, width(stroke[0].pressure) / 2, 0, 2 * Math.PI);
    ctx.fill();
    return;
  }
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1];
    const b = stroke[i];
    ctx.beginPath();
    ctx.lineWidth = width((a.pressure + b.pressure) / 2);
    ctx.moveTo(a.x * size, a.y * size);
    ctx.lineTo(b.x * size, b.y * size);
    ctx.stroke();
  }
}

export const WritingPad = forwardRef<WritingPadHandle, WritingPadProps>(function WritingPad(
  { onChange, guidePaths = [], showGuide = false, pencilOnly = false, disabled = false },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activePointerRef = useRef<number | null>(null);
  const penSeenAtRef = useRef(-Infinity);
  const frameRef = useRef<number | null>(null);
  const callbackRef = useRef(onChange);
  const [hasInk, setHasInk] = useState(false);
  const [guideStarts, setGuideStarts] = useState<{ x: number; y: number }[]>([]);
  const guideRef = useRef<SVGSVGElement>(null);
  callbackRef.current = onChange;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) paintStroke(ctx, stroke, canvas.width, false);
  }, []);

  const scheduleRedraw = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      redraw();
    });
  }, [redraw]);

  const emitChange = useCallback(() => {
    setHasInk(strokesRef.current.length > 0);
    callbackRef.current(strokesRef.current.map(stroke => [...stroke]));
  }, []);

  const releaseActivePointer = useCallback(() => {
    const canvas = canvasRef.current;
    const id = activePointerRef.current;
    // Clear before release: lostpointercapture must not remove a finished stroke.
    activePointerRef.current = null;
    if (id !== null && canvas?.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }, []);

  useImperativeHandle(forwardedRef, () => ({
    clear() {
      releaseActivePointer();
      strokesRef.current = [];
      redraw();
      emitChange();
    },
    undo() {
      releaseActivePointer();
      strokesRef.current = strokesRef.current.slice(0, -1);
      redraw();
      emitChange();
    },
    getImageData() {
      if (!strokesRef.current.length) return null;
      // A separate raster is essential: the model never sees grid, hint or UI.
      const clean = document.createElement('canvas');
      clean.width = clean.height = 512;
      const ctx = clean.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 512, 512);
      for (const stroke of strokesRef.current) paintStroke(ctx, stroke, 512, true);
      return ctx.getImageData(0, 0, 512, 512);
    },
    getStrokes() { return strokesRef.current.map(stroke => [...stroke]); },
    isEmpty() { return strokesRef.current.length === 0; },
  }), [emitChange, redraw, releaseActivePointer]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const size = Math.max(1, Math.round(wrapper.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 3)));
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = canvas.height = size;
        redraw();
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => { observer.disconnect(); };
  }, [redraw]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  useEffect(() => {
    if (disabled && activePointerRef.current !== null) {
      releaseActivePointer();
      emitChange();
    }
  }, [disabled, releaseActivePointer, emitChange]);

  useLayoutEffect(() => {
    if (!showGuide || !guideRef.current) {
      setGuideStarts([]);
      return;
    }
    const paths = guideRef.current.querySelectorAll<SVGPathElement>('.pad-guide-path');
    setGuideStarts(Array.from(paths, path => {
      const point = path.getPointAtLength(0);
      return { x: point.x, y: point.y };
    }));
  }, [guidePaths, showGuide]);

  const addPoints = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (!stroke || !rect.width) return;
    const native = event.nativeEvent;
    const samples = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    for (const sample of samples.length ? samples : [native]) {
      const point: Point = {
        x: Math.max(0, Math.min(1, (sample.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (sample.clientY - rect.top) / rect.height)),
        pressure: sample.pressure > 0 ? sample.pressure : 0.5,
        time: sample.timeStamp,
      };
      const last = stroke[stroke.length - 1];
      if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.0003) stroke.push(point);
    }
    scheduleRedraw();
  };

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || event.button > 0) return;
    const isPen = event.pointerType === 'pen';
    if (isPen) {
      penSeenAtRef.current = performance.now();
      // If a palm lands just before the Pencil, discard its provisional stroke.
      if (activePointerRef.current !== null) {
        releaseActivePointer();
        strokesRef.current.pop();
      }
    }
    if (activePointerRef.current !== null) return;
    if (pencilOnly && !isPen && event.pointerType !== 'mouse') return;
    if (event.pointerType === 'touch' && performance.now() - penSeenAtRef.current < 1200) return;
    event.preventDefault();
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    strokesRef.current.push([]);
    addPoints(event);
    setHasInk(true);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId !== activePointerRef.current || disabled) return;
    event.preventDefault();
    if (event.pointerType === 'pen') penSeenAtRef.current = performance.now();
    addPoints(event);
  };

  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId !== activePointerRef.current) return;
    event.preventDefault();
    addPoints(event);
    releaseActivePointer();
    emitChange();
  };

  const pointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId !== activePointerRef.current) return;
    releaseActivePointer();
    strokesRef.current.pop();
    redraw();
    emitChange();
  };

  return (
    <div ref={wrapperRef} className={`writing-pad${disabled ? ' writing-pad--disabled' : ''}`}>
      <div className="pad-grid" aria-hidden="true" />
      <span className="pad-corner pad-corner--tl" aria-hidden="true" />
      <span className="pad-corner pad-corner--tr" aria-hidden="true" />
      <span className="pad-corner pad-corner--bl" aria-hidden="true" />
      <span className="pad-corner pad-corner--br" aria-hidden="true" />
      {showGuide && guidePaths.length > 0 && (
        <svg key={guidePaths.join('')} ref={guideRef} className="pad-guide" viewBox="0 0 109 109" aria-hidden="true">
          {guidePaths.map((d, i) => (
            <path key={i} d={d} pathLength={1} className="pad-guide-path" style={{ animationDelay: `${i * 650}ms` }} />
          ))}
          {guideStarts.map((p, i) => (
            <g key={i} className="pad-guide-number">
              <circle cx={p.x - 3} cy={p.y - 5} r="3.5" />
              <text x={p.x - 3} y={p.y - 5} dominantBaseline="central" textAnchor="middle">{i + 1}</text>
            </g>
          ))}
        </svg>
      )}
      {!hasInk && !showGuide && <span className="pad-placeholder" aria-hidden="true"><span>ここに書く</span>Buraya yaz</span>}
      <canvas
        ref={canvasRef}
        className="pad-canvas"
        aria-label="Hiragana yazı alanı. Apple Pencil, fare veya parmakla bir karakter çiz."
        aria-disabled={disabled}
        role="img"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onLostPointerCapture={pointerCancel}
        onContextMenu={event => event.preventDefault()}
      />
    </div>
  );
});
