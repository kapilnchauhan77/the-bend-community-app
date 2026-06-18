// "BENDER" block-letter wordmark — BEND in solid framed blocks, ER in dashed
// blocks (italic), echoing the alphabet-block motif of the main logo. Inline
// SVG so it inherits the page's serif (Cormorant Garamond) and uses
// currentColor — set the color on the parent (e.g. the bronze accent).

const LETTERS = ['B', 'E', 'N', 'D', 'E', 'R'] as const;
const SOLID_COUNT = 4; // first N boxes are solid; the rest dashed + italic

const BOX = 100;
const GAP = 16;
const INSET = 4; // half of STROKE, so the border sits fully inside the viewBox
const STROKE = 8;
const STEP = BOX + GAP;
const WIDTH = LETTERS.length * BOX + (LETTERS.length - 1) * GAP;

interface BenderLogoProps {
  className?: string;
  title?: string;
}

export function BenderLogo({ className = '', title = 'Bender' }: BenderLogoProps) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${BOX}`}
      className={className}
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {LETTERS.map((ch, i) => {
        const dashed = i >= SOLID_COUNT;
        const x = i * STEP;
        return (
          <g key={i}>
            <rect
              x={x + INSET}
              y={INSET}
              width={BOX - INSET * 2}
              height={BOX - INSET * 2}
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeDasharray={dashed ? '16 11' : undefined}
            />
            <text
              x={x + BOX / 2}
              y={BOX / 2 + 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="currentColor"
              fontFamily="'Cormorant Garamond', Georgia, 'Times New Roman', serif"
              fontSize={62}
              fontWeight={600}
              fontStyle={dashed ? 'italic' : 'normal'}
            >
              {ch}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
