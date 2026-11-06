// The fonts of the site. next/font downloads them at build time and serves them from the site, so
// no request goes to Google when a page loads. Each font sets a CSS variable on <html>.
import { Inter, Lilita_One, Montserrat } from 'next/font/google';

const lilitaOne = Lilita_One({ weight: '400', subsets: ['latin'], variable: '--font-lilita-one', display: 'swap' });
const inter = Inter({ weight: ['400', '600', '700'], subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const montserrat = Montserrat({ weight: ['500', '800'], subsets: ['latin'], variable: '--font-montserrat', display: 'swap' });

/** The class names that set the font variables. */
export const fontVariables = [lilitaOne.variable, inter.variable, montserrat.variable].join(' ');
