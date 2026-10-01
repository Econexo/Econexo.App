import React, { useLayoutEffect, useRef } from 'react';

/**
 * Texto de una sola línea que achica su fuente hasta caber en el ancho
 * disponible. Para cifras en tarjetas estrechas: «10.769,8» no cabe en un
 * tercio de pantalla de celular con la fuente grande, y en vez de salirse del
 * recuadro se reduce. Nunca crece por encima del tamaño que hereda.
 */
const FitText: React.FC<{ children: React.ReactNode; className?: string; minScale?: number }> = ({
  children,
  className = '',
  minScale = 0.5,
}) => {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const fit = () => {
      inner.style.fontSize = '1em';
      const available = outer.clientWidth;
      const needed = inner.scrollWidth;
      if (available > 0 && needed > available) {
        inner.style.fontSize = `${Math.max(minScale, available / needed)}em`;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    // Las fuentes web cargan después del primer render y cambian el ancho.
    document.fonts?.ready.then(fit).catch(() => {});
    return () => observer.disconnect();
  }, [children, minScale]);

  return (
    <span ref={outerRef} className={`block w-full min-w-0 overflow-hidden ${className}`}>
      <span ref={innerRef} className="inline-block whitespace-nowrap">
        {children}
      </span>
    </span>
  );
};

export default FitText;
