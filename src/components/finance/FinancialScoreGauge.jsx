import React, { useEffect, useState } from "react";
import { useCountUp } from "../../hooks/useCountUp.js";

function colorFor(score) {
  if (score <= 40) return "#A63D2C";
  if (score <= 60) return "#C1892E";
  if (score <= 80) return "#5C8A72";
  return "#1F5C56";
}

function levelFor(score) {
  if (score <= 40) return "Crítica";
  if (score <= 60) return "Débil";
  if (score <= 80) return "Estable";
  return "Sólida";
}

export function FinancialScoreGauge({ score, size = 96 }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  // El arco se dibuja desde cero y el número cuenta a la par.
  const [drawn, setDrawn] = useState(0);
  useEffect(() => { const frame = requestAnimationFrame(() => setDrawn(score)); return () => cancelAnimationFrame(frame); }, [score]);
  const shownScore = Math.round(useCountUp(score, 900));
  const offset = circumference * (1 - drawn / 100);
  const color = colorFor(score);

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Salud financiera ${score}%, ${levelFor(score)}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#EAE5D4" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="10"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
        <text x="50%" y="52%" textAnchor="middle" fontSize="22" fontFamily="Lora, serif" fontWeight="600" fill="#22302C">
          {shownScore}%
        </text>
      </svg>
      <div>
        <div className="font-display font-semibold" style={{ color }}>
          {levelFor(score)}
        </div>
        <div className="text-ink-soft text-xs">Salud financiera</div>
      </div>
    </div>
  );
}
