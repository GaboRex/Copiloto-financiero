import React, { useEffect, useRef, useState } from "react";

// Mascota de Copiloto Financiero: un robot copiloto original dibujado en SVG.
// - Flota, parpadea, saluda con el brazo y la antena "transmite".
// - Sus ojos siguen el puntero (o el dedo) dentro de un rango pequeño.
// - mood: "idle" | "happy" | "thinking" cambia la expresión.
// Todas las animaciones se apagan con prefers-reduced-motion (index.css).
export function CopilotBot({ mood = "idle", size = 180, className = "" }) {
  const svgRef = useRef(null);
  const [look, setLook] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    let frame = 0;
    function onMove(event) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = svgRef.current?.getBoundingClientRect();
        if (!box) return;
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height * 0.36);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, distance / 260);
        setLook({ x: (dx / distance) * 3.2 * reach, y: (dy / distance) * 2.4 * reach });
      });
    }
    window.addEventListener("pointermove", onMove);
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(frame); };
  }, []);

  const eyes = mood === "thinking" ? { x: 2.5, y: -2.5 } : look;

  return (
    <svg ref={svgRef} width={size} height={size * 1.1} viewBox="0 0 160 176" className={className} aria-hidden="true" focusable="false">
      <ellipse className="bot-shadow" cx="80" cy="166" rx="30" ry="4.5" fill="#22302C" opacity="0.22" />
      <g className="bot-float">
        {/* Antena con señal */}
        <line x1="80" y1="30" x2="80" y2="15" stroke="#F3F0E4" strokeWidth="4" strokeLinecap="round" />
        <circle className={mood === "thinking" ? "bot-halo bot-halo-fast" : "bot-halo"} cx="80" cy="12" r="6" fill="#E9B65C" />
        <circle cx="80" cy="12" r="5.5" fill="#E9B65C" />

        {/* Orejas */}
        <rect x="28" y="52" width="10" height="20" rx="5" fill="#C1892E" />
        <rect x="122" y="52" width="10" height="20" rx="5" fill="#C1892E" />

        {/* Cabeza y pantalla */}
        <rect x="35" y="29" width="90" height="66" rx="24" fill="#F3F0E4" />
        <rect x="46" y="41" width="68" height="42" rx="15" fill="#22302C" />
        <g style={{ transform: `translate(${eyes.x}px, ${eyes.y}px)`, transition: "transform 120ms ease-out" }}>
          {mood === "happy" ? (
            <>
              <path d="M60 64 q6 -8 12 0" stroke="#8FE0D0" strokeWidth="4" fill="none" strokeLinecap="round" />
              <path d="M88 64 q6 -8 12 0" stroke="#8FE0D0" strokeWidth="4" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse className="bot-blink" cx="66" cy="60" rx="6" ry="7.5" fill="#8FE0D0" />
              <ellipse className="bot-blink" cx="94" cy="60" rx="6" ry="7.5" fill="#8FE0D0" />
            </>
          )}
          <path d={mood === "happy" ? "M70 72 q10 8 20 0" : "M72 73 q8 5 16 0"} stroke="#8FE0D0" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        {/* Mejillas */}
        <circle cx="54" cy="76" r="3.5" fill="#E9B65C" opacity="0.5" />
        <circle cx="106" cy="76" r="3.5" fill="#E9B65C" opacity="0.5" />

        {/* Cuello y cuerpo */}
        <rect x="72" y="93" width="16" height="9" rx="3" fill="#D3CCB6" />
        <rect x="50" y="100" width="60" height="48" rx="18" fill="#F3F0E4" />
        {/* Insignia: gráfico que sube */}
        <circle cx="80" cy="124" r="13" fill="#1F5C56" />
        <polyline points="72,129 77,124 81,127 88,119" fill="none" stroke="#8FE0D0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="84,119 88,119 88,123" fill="none" stroke="#8FE0D0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />

        {/* Brazo izquierdo en reposo */}
        <path d="M52 112 Q40 122 42 136" stroke="#F3F0E4" strokeWidth="9" fill="none" strokeLinecap="round" />
        {/* Brazo derecho saludando (gira desde el hombro) */}
        <g className={mood === "thinking" ? "" : "bot-wave"}>
          <path d="M108 112 Q122 104 126 88" stroke="#F3F0E4" strokeWidth="9" fill="none" strokeLinecap="round" />
          <circle cx="127" cy="84" r="7" fill="#F3F0E4" />
        </g>
      </g>
    </svg>
  );
}
