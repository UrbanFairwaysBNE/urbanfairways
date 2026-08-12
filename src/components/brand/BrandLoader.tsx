import { UF_MARK_PATHS } from "./uf-mark-paths";

interface BrandLoaderProps {
  /** Pixel size of the mark */
  size?: number;
  /** Optional label shown beneath the mark */
  label?: string;
  /** Fill the viewport height */
  fullscreen?: boolean;
  className?: string;
}

/**
 * Animated Urban Fairways mark used as the loading indicator across the
 * website and the app. The outline is traced (starting from the left of the
 * U and following the curve all the way round) and the solid colour fades in
 * behind it, then the whole loop repeats.
 */
const BrandLoader = ({ size = 96, label, fullscreen = false, className = "" }: BrandLoaderProps) => {
  const mark = (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 2186 2186"
        role="img"
        aria-label="Loading"
        className="uf-loader"
      >
        <style>{`
          @keyframes uf-trace { 0% { stroke-dashoffset: 1; } 42% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 0; } }
          @keyframes uf-fill { 0%, 18% { fill-opacity: 0; } 46%, 100% { fill-opacity: 1; } }
          @keyframes uf-ball { 0%, 45% { opacity: 0; transform: scale(0); } 52%, 100% { opacity: 1; transform: scale(1); } }
          .uf-loader .uf-path {
            stroke-width: 40;
            stroke-linecap: round;
            stroke-linejoin: round;
            fill-opacity: 0;
            stroke-dasharray: 1;
            stroke-dashoffset: 1;
            animation:
              uf-trace 2.4s cubic-bezier(0.65, 0, 0.35, 1) infinite,
              uf-fill 2.4s ease-out infinite;
          }
          .uf-loader .uf-ball {
            transform-origin: 1547.25px 702.76px;
            opacity: 0;
            animation: uf-ball 2.4s ease-out infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .uf-loader .uf-path, .uf-loader .uf-ball {
              animation: none;
              stroke-dashoffset: 0;
              fill-opacity: 1;
              opacity: 1;
              transform: none;
            }
          }
        `}</style>
        {/* Green U curve first, then the rest of the mark trails behind it */}
        {[1, 0, 2, 3, 4, 5].map((index, order) => {
          const p = UF_MARK_PATHS[index];
          if (!p) return null;
          return (
            <path
              key={index}
              className="uf-path"
              d={p.d}
              pathLength={1}
              fill={p.fill}
              stroke={p.fill}
              style={{ animationDelay: `${order * 0.05}s` }}
            />
          );
        })}
      </svg>
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
    </div>
  );

  if (!fullscreen) return mark;

  return <div className="min-h-screen flex items-center justify-center bg-background">{mark}</div>;
};

export default BrandLoader;
