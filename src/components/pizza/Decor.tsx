import { Pizza, type PizzaVariant } from './Pizza';
import styles from './decor.module.css';

interface Spot {
    variant: PizzaVariant;
    size: number;
    className: string;
}

function Spots({ spots, className }: { spots: Spot[]; className: string }) {
    return (
        <div className={className} aria-hidden="true">
            {spots.map((spot) => (
                <Pizza key={spot.className} variant={spot.variant} size={spot.size} className={`${styles.pizza} ${spot.className}`} />
            ))}
        </div>
    );
}

const HEADER: Spot[] = [
    { variant: 'ham', size: 220, className: styles.headerA },
    { variant: 'taco', size: 220, className: styles.headerB },
    { variant: 'sliced', size: 220, className: styles.headerC },
];

const EDGES: Spot[] = [
    { variant: 'deluxe', size: 220, className: styles.edgeA },
    { variant: 'taco', size: 170, className: styles.edgeB },
    { variant: 'sliced', size: 250, className: styles.edgeC },
    { variant: 'ham', size: 190, className: styles.edgeD },
];

const AUTH: Spot[] = [
    { variant: 'pepperoni', size: 260, className: styles.authA },
    { variant: 'sliced', size: 180, className: styles.authB },
    { variant: 'ham', size: 150, className: styles.authC },
    { variant: 'taco', size: 210, className: styles.authD },
];

/** Large pizzas in the red header, cut off at its edges. They only darken the red, so the menu stays readable. */
export function HeaderPizzas() {
    return <Spots spots={HEADER} className={styles.header} />;
}

/** Pizzas that peek in at the edges of a cream page, behind the content. Only shown where the page has room. */
export function EdgePizzas() {
    return <Spots spots={EDGES} className={styles.edges} />;
}

/** Pizzas around the middle column of the red sign-up and sign-in pages. */
export function AuthPizzas() {
    return <Spots spots={AUTH} className={styles.auth} />;
}
