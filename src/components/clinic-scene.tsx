"use client";

/** Original SVG character animation: no video downloads, autoplay audio or external assets. */
export function ClinicScene({
  celebrating = false,
}: {
  celebrating?: boolean;
}) {
  return (
    <svg
      className={`clinic-scene ${celebrating ? "celebrating" : ""}`}
      viewBox="0 0 480 340"
      role="img"
      aria-label="Flo, a friendly animated clinic assistant, checking a clipboard beside a little plant"
    >
      <defs>
        <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fffef7" />
          <stop offset=".65" stopColor="#e9ecdf" />
          <stop offset="1" stopColor="#b1c6be" />
        </linearGradient>
        <linearGradient id="orange" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffb48c" />
          <stop offset="1" stopColor="#e56c40" />
        </linearGradient>
        <linearGradient id="visor" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#314a51" />
          <stop offset="1" stopColor="#122b33" />
        </linearGradient>
        <linearGradient id="plinth" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#edf0e6" />
          <stop offset="1" stopColor="#b0c6ba" />
        </linearGradient>
        <radialGradient id="glow">
          <stop stopColor="#d7e9b3" stopOpacity=".9" />
          <stop offset="1" stopColor="#d7e9b3" stopOpacity="0" />
        </radialGradient>
        <filter id="shadow">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      <ellipse cx="255" cy="165" rx="190" ry="170" fill="url(#glow)" />
      <g opacity=".22" fill="none" stroke="#719280">
        <ellipse cx="267" cy="263" rx="199" ry="63" />
        <ellipse cx="267" cy="263" rx="167" ry="47" />
        <path d="m72 267 376 0M121 223l287 86M407 224l-282 88" />
      </g>
      <g className="scene-orbit">
        <path d="m392 81 0 16m-8-8h16" stroke="#ee9369" strokeWidth="3" />
        <circle cx="100" cy="141" r="4" fill="#e9a37c" />
        <path d="m362 37 0 10m-5-5h10" stroke="#91a878" strokeWidth="2" />
      </g>
      <ellipse
        className="flo-shadow"
        cx="246"
        cy="283"
        rx="87"
        ry="17"
        fill="#496c59"
        opacity=".17"
        filter="url(#shadow)"
      />
      <path d="M139 270v17c0 31 204 31 204 0v-17Z" fill="url(#plinth)" />
      <ellipse
        cx="241"
        cy="269"
        rx="102"
        ry="29"
        fill="#f0f1df"
        stroke="#fff"
        strokeOpacity=".7"
      />
      <g className="flo-body">
        <g className="flo-antenna">
          <path d="M238 82V59" stroke="#789a8a" strokeWidth="6" />
          <circle cx="238" cy="54" r="10" fill="url(#orange)" />
          <circle cx="235" cy="51" r="3" fill="#ffdcc4" />
        </g>
        <path
          d="M187 222v31c0 13 32 15 33 0v-28m37 0v29c1 13 33 12 33-1v-30"
          fill="url(#body)"
          stroke="#b9c9bb"
        />
        <path
          d="M190 252c-19 0-24 9-17 15 7 6 36 5 44-3v-11m58 0c20-2 32 9 23 14-9 6-30 4-37-3v-10"
          fill="#24423e"
        />
        <rect
          x="176"
          y="160"
          width="122"
          height="84"
          rx="37"
          fill="url(#body)"
        />
        <path d="M224 174h29l8 62h-43Z" fill="#b4c5a4" />
        <path
          d="m218 172 20 16-18 17-17-28m56-5-21 16 18 17 16-28"
          fill="#fbfcf3"
        />
        <rect x="271" y="192" width="14" height="18" rx="3" fill="#e98257" />
        <path d="M275 198h6m-3-3v6" stroke="#fff9ed" strokeWidth="2" />
        <g className="flo-left-arm">
          <path
            d="M181 184c-14-6-27 11-26 28 0 9 11 12 19 6l13-16"
            fill="url(#body)"
            stroke="#b5c5b6"
          />
          <ellipse cx="165" cy="222" rx="12" ry="11" fill="#e59a71" />
        </g>
        <g className="flo-head">
          <rect x="158" y="99" width="18" height="40" rx="9" fill="#a6bbaa" />
          <rect x="303" y="99" width="18" height="40" rx="9" fill="#a6bbaa" />
          <rect
            x="168"
            y="73"
            width="145"
            height="105"
            rx="43"
            fill="url(#body)"
            stroke="#f4f5ea"
            strokeWidth="2"
          />
          <path
            d="M180 100c7-16 114-16 122 0v33c-5 28-116 28-122 0Z"
            fill="url(#visor)"
          />
          <path
            d="M192 100c28-8 65-7 86-4"
            stroke="#799b95"
            opacity=".45"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <g className="flo-eyes" fill="#dcebc0">
            <rect x="208" y="111" width="11" height="17" rx="5.5" />
            <rect x="263" y="111" width="11" height="17" rx="5.5" />
          </g>
          <path
            className="flo-smile"
            d="M234 137q8 8 16-1"
            fill="none"
            stroke="#dcebc0"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse
            cx="200"
            cy="137"
            rx="7"
            ry="3"
            fill="#f4a078"
            opacity=".7"
          />
          <ellipse
            cx="283"
            cy="137"
            rx="7"
            ry="3"
            fill="#f4a078"
            opacity=".7"
          />
        </g>
        <g className="flo-clipboard">
          <rect
            x="273"
            y="186"
            width="51"
            height="66"
            rx="7"
            fill="#294941"
            transform="rotate(-15 273 186)"
          />
          <rect
            x="279"
            y="192"
            width="39"
            height="50"
            rx="3"
            fill="#f3edda"
            transform="rotate(-15 279 192)"
          />
          <path
            d="m289 206 4 3 6-10m-7 19 16-4m-13 13 16-4"
            fill="none"
            stroke="#7a9980"
            strokeWidth="2"
          />
          <ellipse cx="304" cy="208" rx="11" ry="9" fill="#eda87e" />
        </g>
      </g>
      <g className="scene-plant">
        <path d="M376 254v-69" stroke="#527e62" strokeWidth="3" />
        <path
          d="M376 224c-31 0-40-22-23-22 12 0 19 12 23 22m0-19c29 1 37-25 22-26-14-1-20 17-22 26m0-9c-22-6-23-34-9-31 12 3 8 20 9 31"
          fill="#6d9b72"
        />
        <path d="M354 246h44l-7 39h-30Z" fill="url(#orange)" />
        <ellipse cx="376" cy="246" rx="22" ry="6" fill="#f9b790" />
      </g>
      <g className="floating-check">
        <rect
          x="92"
          y="66"
          width="76"
          height="49"
          rx="13"
          fill="#fffdf4"
          stroke="#dce4d2"
        />
        <circle cx="115" cy="90" r="10" fill="#d8e7b5" />
        <path
          d="m110 90 3 3 7-7"
          fill="none"
          stroke="#45614b"
          strokeWidth="2"
        />
        <path
          d="M133 86h22m-22 8h15"
          stroke="#9cafa0"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g className="floating-time">
        <rect
          x="338"
          y="119"
          width="89"
          height="45"
          rx="12"
          fill="#fffdf4"
          stroke="#dce4d2"
        />
        <circle
          cx="358"
          cy="141"
          r="10"
          fill="none"
          stroke="#d48a64"
          strokeWidth="2"
        />
        <path d="M358 135v7l4 2" stroke="#d48a64" fill="none" strokeWidth="2" />
        <text
          x="376"
          y="145"
          fontSize="12"
          fill="#45614b"
          fontFamily="sans-serif"
        >
          All set.
        </text>
      </g>
    </svg>
  );
}
