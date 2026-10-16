import type { Shape } from '@emergentworlds/emergence-engine';

export const ASSIGNMENTS = ['timber', 'hulls', 'rigging'] as const;
export type Assignment = typeof ASSIGNMENTS[number];
export const yardShape: Shape = {
  id: 'yard',
  slots: [{ name: 'assignment', version: 1, initial: 'hulls' }],
  clock: { minutesPerTick: 1440, format: at => `day ${Math.floor(at / 1440) + 1}` },
  status: ctx => `Kestrel Yards, day ${ctx.tick + 1}: ${ctx.get('completed')} of ${ctx.get('orders')} orders ready`,
  steps: [{ phase: 'after', order: 1, run(ctx) {
    const weather = ctx.random();
    const factor = weather < 0.6 ? 1 : weather < 0.9 ? 0.5 : 0;
    ctx.set('weather', factor === 1 ? 'clear' : factor === 0.5 ? 'rain' : 'gales');
    const crew = Math.max(0, Number(ctx.get('crew')));
    const work = crew / 6 * factor;
    const assignment = ctx.slot('assignment');
    if (assignment === 'timber') ctx.add('timber', work * 2);
    if (assignment === 'hulls') {
      const progress = Math.min(work, Number(ctx.get('berths')), Number(ctx.get('timber')) / 2, Math.max(0, Number(ctx.get('orders')) - Number(ctx.get('hulls'))));
      ctx.add('hulls', progress); ctx.add('timber', -progress * 2);
    }
    if (assignment === 'rigging') {
      const progress = Math.min(work, Math.max(0, Number(ctx.get('hulls')) - Number(ctx.get('rigging'))));
      ctx.add('rigging', progress);
    }
    const completed = Math.min(Number(ctx.get('orders')), Math.floor(Number(ctx.get('rigging'))));
    if (completed > Number(ctx.get('completed'))) ctx.event({ level: 'notable', text: 'An order is ready to leave Kestrel Yards.', refs: ['completed'] });
    ctx.set('completed', completed);
  } }],
};

export const opening = [
  { id: 'crew', name: 'Crew', value: 6 },
  { id: 'berths', name: 'Berths', value: 2 },
  { id: 'orders', name: 'Orders', value: 3 },
  { id: 'timber', name: 'Timber', value: 12 },
  { id: 'hulls', name: 'Hulls', value: 0 },
  { id: 'rigging', name: 'Rigging', value: 0 },
  { id: 'completed', name: 'Orders ready', value: 0 },
  { id: 'weather', name: 'Weather', kind: 'text', value: 'clear' },
].map(variable => ({ op: 'variable.add', variable }));
