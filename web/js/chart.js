import { cumulative } from './calc.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 170;
const PAD = { left: 10, right: 10, top: 22, bottom: 24 };

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

// Draws the money kept over time: it starts at minus the hardware cost and
// grows by the monthly savings. `elapsed` (months so far) splits the line into
// a solid part (the past) and a dashed one (the projection).
export function drawChart(container, { netBeforeHardware, hardwareCost, elapsed, horizon, breakEven, label, text }) {
  const values = [];
  for (let m = 0; m <= horizon; m++) values.push(cumulative(m, netBeforeHardware, hardwareCost));
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = high - low || 1;

  const x = (m) => PAD.left + (m / horizon) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + ((high - v) / span) * (H - PAD.top - PAD.bottom);
  const point = (m) => `${x(m).toFixed(1)},${y(values[m]).toFixed(1)}`;
  const line = (from, to) => {
    const points = [];
    for (let m = from; m <= to; m++) points.push(point(m));
    return points.join(' ');
  };

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  root.append(svg('line', { class: 'axis', x1: PAD.left, x2: W - PAD.right, y1: y(0), y2: y(0) }));

  const split = elapsed === null ? 0 : Math.min(elapsed, horizon);
  if (elapsed !== null) {
    root.append(svg('polyline', { class: 'past', points: line(0, split) }));
  }
  if (split < horizon) {
    root.append(svg('polyline', { class: 'future', points: line(split, horizon) }));
  }

  if (elapsed !== null && elapsed <= horizon) {
    root.append(
      svg('line', { class: 'now', x1: x(elapsed), x2: x(elapsed), y1: PAD.top - 6, y2: H - PAD.bottom }),
      svg('circle', { class: 'dot', cx: x(elapsed), cy: y(values[elapsed]), r: 3.5 }),
      svg('text', { class: 'tick', x: x(elapsed), y: PAD.top - 10, 'text-anchor': elapsed > horizon * 0.8 ? 'end' : 'middle' }, text.now),
    );
  }
  if (breakEven && breakEven <= horizon) {
    root.append(
      svg('circle', { class: 'zero', cx: x(breakEven), cy: y(0), r: 3.5 }),
      // The line rises through zero here, so the free space is below and to the right.
      svg('text', { class: 'tick', x: x(breakEven) + 6, y: y(0) + 14 }, text.breakEven),
    );
  }
  root.append(
    svg('text', { class: 'tick', x: PAD.left, y: H - 6 }, '0'),
    svg('text', { class: 'tick', x: W - PAD.right, y: H - 6, 'text-anchor': 'end' }, text.end),
  );
  container.replaceChildren(root);
}
