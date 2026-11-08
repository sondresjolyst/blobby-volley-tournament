import { createContext, useContext } from 'react';

/** The host of the site, such as `julalan.no`, for the addresses the big screen shows. Null when it is not configured. */
export const SiteContext = createContext<string | null>(null);

export const useSite = () => useContext(SiteContext);
