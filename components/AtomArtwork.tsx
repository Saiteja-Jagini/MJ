export function AtomArtwork() {
  const nodes = [
    [85, 115, 12],
    [130, 90, 15],
    [177, 115, 13],
    [177, 166, 15],
    [131, 191, 12],
    [85, 165, 14],
    [226, 89, 12],
    [271, 114, 15],
    [271, 166, 12],
    [225, 192, 14],
    [321, 90, 12],
    [363, 115, 10],
    [319, 216, 11],
    [48, 90, 9],
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0],
    [2, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [9, 3],
    [7, 10],
    [10, 11],
    [8, 12],
    [0, 13],
  ];
  return (
    <svg
      viewBox="0 0 420 280"
      className="atom-artwork"
      role="img"
      aria-label="Decorative molecular illustration"
    >
      <defs>
        <radialGradient id="atom-violet" cx="30%" cy="25%">
          <stop stopColor="#e8d2b5" />
          <stop offset=".4" stopColor="#934d49" />
          <stop offset="1" stopColor="#590907" />
        </radialGradient>
        <radialGradient id="atom-cyan" cx="30%" cy="25%">
          <stop stopColor="#e8d2b5" />
          <stop offset=".4" stopColor="#a5a79b" />
          <stop offset="1" stopColor="#62695f" />
        </radialGradient>
        <linearGradient id="bond" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#590907" />
          <stop offset="1" stopColor="#e8d2b5" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="20" />
        </filter>
      </defs>
      <ellipse
        cx="211"
        cy="143"
        rx="105"
        ry="65"
        fill="#590907"
        opacity=".13"
        filter="url(#glow)"
      />
      <g transform="rotate(-14 210 140)">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a][0]}
            y1={nodes[a][1]}
            x2={nodes[b][0]}
            y2={nodes[b][1]}
            stroke="url(#bond)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity=".8"
          />
        ))}
        {nodes.map(([x, y, r], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill={i === 6 || i === 12 ? 'url(#atom-cyan)' : 'url(#atom-violet)'}
          />
        ))}
      </g>
      <circle
        cx="215"
        cy="140"
        r="117"
        fill="none"
        stroke="#590907"
        strokeOpacity=".1"
        strokeDasharray="3 7"
      />
      <circle cx="215" cy="140" r="92" fill="none" stroke="#590907" strokeOpacity=".08" />
    </svg>
  );
}
