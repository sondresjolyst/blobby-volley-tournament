/**
 * A page that sends a form post in the background sets this header. The API route then answers
 * with the address it would redirect to, as JSON, instead of the redirect.
 */
export const BACKGROUND_POST_HEADER = 'x-background-post';
