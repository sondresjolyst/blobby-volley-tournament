import type { ReactNode } from 'react';

/** The pizzas of the site. They are drawn here, so no outside artwork is used. */
export type PizzaVariant = 'pepperoni' | 'ham' | 'deluxe' | 'taco' | 'sliced';

const RED = '#D6362A';
const GREEN = '#3E7A2F';

function pep(x: number, y: number, r: number): ReactNode {
    return (
        <g key={`p${x},${y}`}>
            <circle cx={x} cy={y} r={r} fill="#A82A1A" />
            <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.25} fill="#C8453A" />
        </g>
    );
}

function basil(x: number, y: number, rot: number): ReactNode {
    return <path key={`b${x},${y}`} d="M0 0 q5 -6 10 0 q-5 6 -10 0z" fill={GREEN} transform={`translate(${x} ${y}) rotate(${rot})`} />;
}

function bubble(x: number, y: number): ReactNode {
    return <ellipse key={`c${x},${y}`} cx={x} cy={y} rx="4" ry="2.5" fill="#FBE08A" />;
}

function olive(x: number, y: number): ReactNode {
    return <circle key={`o${x},${y}`} cx={x} cy={y} r="3.2" fill="none" stroke="#2A1A12" strokeWidth="2.2" />;
}

function mushroom(x: number, y: number, rot: number): ReactNode {
    return (
        <g key={`m${x},${y}`} transform={`translate(${x} ${y}) rotate(${rot})`} fill="#E9DCC6" stroke="#8A6A4A" strokeWidth="1">
            <path d="M-5 0 a5 4.5 0 0 1 10 0z" />
            <rect x="-1.6" y="0" width="3.2" height="4" />
        </g>
    );
}

function ham(x: number, y: number, rot: number): ReactNode {
    return <rect key={`h${x},${y}`} x="-4.5" y="-3.5" width="9" height="7" rx="1.5" fill="#E8869A" transform={`translate(${x} ${y}) rotate(${rot})`} />;
}

function strip(x: number, y: number, rot: number, color: string): ReactNode {
    return <rect key={`s${x},${y}`} x="-6" y="-1.4" width="12" height="2.8" rx="1.4" fill={color} transform={`translate(${x} ${y}) rotate(${rot})`} />;
}

function corn(x: number, y: number): ReactNode {
    return <circle key={`k${x},${y}`} cx={x} cy={y} r="1.8" fill="#FFE14D" stroke="#C99A1E" strokeWidth="0.6" />;
}

function mince(x: number, y: number): ReactNode {
    return <circle key={`d${x},${y}`} cx={x} cy={y} r="2.4" fill="#6B3A22" />;
}

const TOPPINGS: Record<PizzaVariant, ReactNode[]> = {
    pepperoni: [
        bubble(48, 22),
        bubble(70, 48),
        bubble(26, 50),
        bubble(50, 74),
        pep(33, 33, 7),
        pep(62, 30, 6),
        pep(68, 58, 7),
        pep(46, 50, 6),
        pep(30, 64, 6),
        pep(54, 72, 5),
        pep(22, 46, 4.5),
        basil(40, 22, -20),
        basil(58, 44, 30),
        basil(36, 76, 10),
    ],
    ham: [
        bubble(48, 20),
        bubble(72, 52),
        bubble(24, 44),
        ham(34, 32, 12),
        ham(62, 34, -15),
        ham(50, 58, 8),
        ham(28, 60, -20),
        ham(68, 66, 25),
        strip(46, 40, 35, GREEN),
        strip(72, 44, -60, RED),
        strip(38, 74, -10, GREEN),
        strip(24, 50, 80, RED),
        strip(58, 22, 5, RED),
    ],
    deluxe: [
        bubble(70, 46),
        bubble(30, 70),
        pep(34, 32, 7),
        pep(64, 64, 7),
        pep(30, 58, 5),
        pep(58, 28, 5),
        olive(50, 44),
        olive(72, 36),
        olive(44, 70),
        olive(22, 44),
        mushroom(46, 24, -15),
        mushroom(70, 52, 20),
        mushroom(56, 74, 0),
        basil(40, 54, 15),
    ],
    taco: [
        mince(30, 32),
        mince(40, 28),
        mince(58, 30),
        mince(66, 40),
        mince(36, 52),
        mince(52, 48),
        mince(62, 62),
        mince(44, 68),
        mince(28, 64),
        mince(70, 54),
        corn(48, 36),
        corn(34, 42),
        corn(60, 52),
        corn(42, 60),
        corn(54, 70),
        corn(26, 52),
        corn(70, 32),
        strip(48, 22, -10, RED),
        strip(72, 66, 40, GREEN),
        strip(24, 40, 70, GREEN),
        <path key="sour-cream" d="M26 74 q10 -8 20 0 t20 -4" stroke="#FFF8EC" strokeWidth="2.4" fill="none" strokeLinecap="round" />,
    ],
    sliced: [
        <g key="cuts" stroke="#D9A62E" strokeWidth="1.5">
            <line x1="48" y1="7" x2="48" y2="89" />
            <line x1="12.5" y1="27.5" x2="83.5" y2="68.5" />
            <line x1="12.5" y1="68.5" x2="83.5" y2="27.5" />
        </g>,
        pep(36, 30, 6),
        pep(62, 32, 6),
        pep(70, 56, 5),
        pep(52, 68, 6),
        pep(28, 58, 5),
        olive(48, 40),
        olive(58, 52),
        mushroom(34, 44, -20),
        mushroom(44, 62, 10),
        basil(64, 44, 40),
        basil(26, 46, -30),
    ],
};

/** A pizza. The extra pepperoni pizza is the logo. The others are decoration. */
export function Pizza({ size, className, variant = 'pepperoni' }: { size: number; className?: string; variant?: PizzaVariant }) {
    return (
        <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" focusable="false" className={className}>
            <circle cx="48" cy="48" r="44" fill="#F6C445" stroke="#8A4B1E" strokeWidth="6" />
            {TOPPINGS[variant]}
        </svg>
    );
}
