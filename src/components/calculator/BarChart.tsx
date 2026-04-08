import React, { useEffect, useState } from 'react';

export default function BarChart({ currentTco, ypTco }: { currentTco: number, ypTco: number }) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // trigger animation
    const raf = requestAnimationFrame(() => {
      setAnimate(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const maxVal = Math.max(currentTco, ypTco, 1);
  const currentHeight = (currentTco / maxVal) * 100;
  const ypHeight = (ypTco / maxVal) * 100;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="flex items-end justify-center gap-12 h-64 mt-8 pb-8 border-b border-white/10 relative">
      <div className="absolute top-0 left-0 text-xs text-neutral-500 font-mono">Cost Total (12 Luni)</div>
      
      {/* Current System Bar */}
      <div className="flex flex-col items-center justify-end h-full w-24 group">
        <div className="text-sm font-medium mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatCurrency(currentTco)}
        </div>
        <div 
          className="w-full bg-neutral-700/80 rounded-t-sm transition-all duration-1000 ease-out relative overflow-hidden"
          style={{ height: animate ? `${currentHeight}%` : '0%' }}
        >
          <div className="absolute inset-x-0 bottom-0 top-auto h-4 bg-neutral-600"></div>
        </div>
        <span className="text-xs text-neutral-400 mt-3 font-medium whitespace-nowrap">Sistem Actual</span>
      </div>

      {/* Premium System Bar */}
      <div className="flex flex-col items-center justify-end h-full w-24 group">
        <div className="text-sm font-bold text-yp-yellow mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatCurrency(ypTco)}
        </div>
        <div 
          className="w-full bg-gradient-to-t from-yp-yellow/50 to-yp-yellow rounded-t-sm transition-all duration-1000 ease-out delay-300 relative overflow-hidden"
          style={{ height: animate ? `${ypHeight}%` : '0%' }}
        >
          <div className="absolute inset-x-0 bottom-0 top-auto h-4 bg-yp-yellow/80"></div>
        </div>
        <span className="text-xs font-bold text-yp-yellow mt-3 whitespace-nowrap">Premium Benchmark</span>
      </div>
      
      {/* Difference Badge */}
      {animate && currentTco > ypTco && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 translate-y-[-50%] bg-green-500/10 text-green-400 border border-green-500/20 px-3 py-1 rounded-full text-xs font-bold animate-in fade-in zoom-in duration-500 delay-1000 uppercase tracking-widest hidden sm:block">
          Economisești {Math.round((1 - ypTco/currentTco)*100)}%
        </div>
      )}
    </div>
  );
}
