// Cardurile 3D (data-tilt): se înclină spre cursor, cu reflexul (.tilt-sheen) care urmărește mouse-ul.
// Doar pe dispozitivele cu mouse și fără „reduce motion”; pe ecranele tactile, efectul de apăsare e în CSS.
// data-tilt="6" = înclinarea maximă, în grade.
const canTilt = () =>
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function bind(el: HTMLElement) {
  if (el.dataset.tiltBound) return;
  el.dataset.tiltBound = '1';
  let frame = 0;
  el.addEventListener('pointermove', (e) => {
    if (!canTilt() || e.pointerType !== 'mouse') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const max = Number(el.dataset.tilt) || 6;
      el.classList.add('is-tilting');
      el.style.transform = `perspective(900px) rotateX(${((0.5 - y) * max).toFixed(2)}deg) rotateY(${((x - 0.5) * max).toFixed(2)}deg) translateY(-4px)`;
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    });
  });
  el.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    el.classList.remove('is-tilting');
    el.style.transform = '';
  });
}

document.querySelectorAll<HTMLElement>('[data-tilt]').forEach(bind);
