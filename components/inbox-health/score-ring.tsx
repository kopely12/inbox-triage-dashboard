'use client';

import { useState, useEffect } from 'react';

function scoreColor(s: number) {
  if (s >= 70) return '#22c55e';
  if (s >= 40) return '#f59e0b';
  return '#ef4444';
}

const SIZES = {
  sm: { svgSize: 76,  radius: 30, stroke: 6,  fontScore: 18, fontLabel: 9,  offsetY: -5, labelY: 9  },
  lg: { svgSize: 116, radius: 46, stroke: 8,  fontScore: 28, fontLabel: 11, offsetY: -7, labelY: 13 },
};

export function ScoreRing({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const [displayed, setDisplayed] = useState(0);
  const { svgSize, radius, stroke, fontScore, fontLabel, offsetY, labelY } = SIZES[size];
  const center = svgSize / 2;
  const circumf = 2 * Math.PI * radius;
  const col = scoreColor(score);

  useEffect(() => {
    const start = performance.now();
    const duration = 700;
    function frame(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(eased * score));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, [score]);

  const offset = circumf * (1 - displayed / 100);

  return (
    <div className="relative shrink-0" title={`${score} / 100`}>
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
        <circle cx={center} cy={center} r={radius} fill="none"
          stroke="currentColor" strokeWidth={stroke} className="text-muted/30" />
        <circle cx={center} cy={center} r={radius} fill="none"
          stroke={col} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumf} strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.05s linear' }}
        />
        <text x={center} y={center + offsetY} textAnchor="middle" dominantBaseline="middle"
          className="fill-foreground" style={{ fontSize: fontScore, fontWeight: 700, fontFamily: 'inherit' }}>
          {displayed}
        </text>
        <text x={center} y={center + labelY} textAnchor="middle" dominantBaseline="middle"
          className="fill-muted-foreground" style={{ fontSize: fontLabel, fontFamily: 'inherit' }}>
          / 100
        </text>
      </svg>
    </div>
  );
}
