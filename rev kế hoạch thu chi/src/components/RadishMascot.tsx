import React from 'react';

export type MascotExpression = 'happy' | 'waving' | 'celebrating' | 'worried' | 'thinking' | 'sleeping';

interface RadishMascotProps {
  expression?: MascotExpression;
  size?: number;
  className?: string;
}

export const RadishMascot: React.FC<RadishMascotProps> = ({
  expression = 'happy',
  size = 84,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Củ Cải Nhỏ - Linh vật Kế Hoạch Thu Chi"
    >
      {/* Subtle ground shadow */}
      <ellipse cx="60" cy="108" rx="28" ry="5" fill="#294D3E" fillOpacity="0.1" />

      {/* Left leaf */}
      <path
        d="M59 35C52 21 38 14 31 20C24 25 30 39 48 41C53 42 57 39 59 35Z"
        fill="#20B889"
        stroke="#294D3E"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right leaf */}
      <path
        d="M61 35C68 20 83 13 90 19C96 25 89 39 71 41C66 42 63 39 61 35Z"
        fill="#34D399"
        stroke="#294D3E"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Leaf vein accents */}
      <path d="M40 25C46 28 52 32 56 36" stroke="#294D3E" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
      <path d="M81 24C75 28 69 32 64 36" stroke="#294D3E" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />

      {/* Plump stylized radish body */}
      <path
        d="M60 36C39 36 27 51 27 69C27 87 41 100 57 103C59 106 60 109 60 111C62 107 64 105 65 102C80 99 93 86 93 69C93 51 81 36 60 36Z"
        fill="#FFFFFF"
        stroke="#294D3E"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Little cute waving hand */}
      {expression === 'waving' && (
        <path
          d="M91 66C99 61 105 53 102 49C99 45 92 52 88 58"
          fill="#FFFFFF"
          stroke="#294D3E"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Celebratory sparkles */}
      {expression === 'celebrating' && (
        <>
          <circle cx="22" cy="40" r="3.5" fill="#F2B85B" />
          <circle cx="98" cy="36" r="4" fill="#20B889" />
          <path d="M102 52L107 49M103 58L109 59" stroke="#F2B85B" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}

      {/* Thinking bubble */}
      {expression === 'thinking' && (
        <>
          <circle cx="98" cy="40" r="2.5" fill="#94A3B8" />
          <circle cx="105" cy="32" r="4" fill="#CBD5E1" />
        </>
      )}

      {/* Soft rosy cheeks */}
      <ellipse cx="42" cy="73" rx="6" ry="3.5" fill="#FDA4AF" fillOpacity="0.75" />
      <ellipse cx="78" cy="73" rx="6" ry="3.5" fill="#FDA4AF" fillOpacity="0.75" />

      {/* Eyes by expression */}
      {(expression === 'happy' || expression === 'waving' || expression === 'celebrating') && (
        <>
          <path d="M43 65C45 61 50 61 52 65" stroke="#294D3E" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M68 65C70 61 75 61 77 65" stroke="#294D3E" strokeWidth="2.8" strokeLinecap="round" />
        </>
      )}

      {expression === 'worried' && (
        <>
          <circle cx="47" cy="64" r="2.7" fill="#294D3E" />
          <circle cx="73" cy="64" r="2.7" fill="#294D3E" />
          <path d="M42 58L50 60" stroke="#294D3E" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M78 58L70 60" stroke="#294D3E" strokeWidth="2.2" strokeLinecap="round" />
          {/* Little sweat drop */}
          <path d="M85 52C85 52 89 57 89 59C89 61 87.2 62.5 85 62.5C82.8 62.5 81 61 81 59C81 57 85 52 85 52Z" fill="#7DD3FC" />
        </>
      )}

      {expression === 'thinking' && (
        <>
          <circle cx="47" cy="64" r="2.7" fill="#294D3E" />
          <path d="M68 64H77" stroke="#294D3E" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}

      {expression === 'sleeping' && (
        <>
          <path d="M43 65C45 68 50 68 52 65" stroke="#294D3E" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M68 65C70 68 75 68 77 65" stroke="#294D3E" strokeWidth="2.5" strokeLinecap="round" />
          <text x="88" y="45" fontSize="11" fontWeight="700" fill="#64748B">z</text>
          <text x="96" y="36" fontSize="14" fontWeight="700" fill="#64748B">Z</text>
        </>
      )}

      {/* Mouth by expression */}
      {(expression === 'happy' || expression === 'waving') && (
        <path d="M55 74C57.5 78 62.5 78 65 74" stroke="#294D3E" strokeWidth="2.6" strokeLinecap="round" />
      )}
      {expression === 'celebrating' && (
        <path d="M54 73C56 80 64 80 66 73Z" fill="#FB7185" stroke="#294D3E" strokeWidth="2.4" strokeLinejoin="round" />
      )}
      {expression === 'worried' && (
        <path d="M55 77C58 74 62 74 65 77" stroke="#294D3E" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {expression === 'thinking' && (
        <circle cx="60" cy="75" r="2.5" fill="#294D3E" />
      )}
      {expression === 'sleeping' && (
        <ellipse cx="60" cy="75" rx="3" ry="2" fill="#FDA4AF" stroke="#294D3E" strokeWidth="2" />
      )}
    </svg>
  );
};
