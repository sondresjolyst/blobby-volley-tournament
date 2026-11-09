// The help behind the i buttons of the player forms, in the jokey Rogaland dialect of the LAN.
// The label of each button is a question, so it never holds the words of the field label.

export const FIELD_INFO = {
    code: { label: 'Koffor ein kode?', text: 'Koden står på storskjermen og hos admin. Koden sørge for at bare dei som e på LANet, kan bli med.' },
    nickname: { label: 'Ka slags navn?', text: 'Velg eit navn dei andre kjenne deg igjen på. Det vises i Blobby Volley, på topplistå og på storskjermen, og du logge inn med det.' },
    pin: { label: 'Ka e PIN-koden te?', text: 'Fire siffer du finne på sjøl. Du treng PIN-koden for å logga inn igjen, så bruk ikkje ein kode du har andre stader.' },
    signInNickname: { label: 'Ka navn?', text: 'Kallenavnet du valgte då du blei med. Store og små bokstava e det same.' },
    signInPin: { label: 'Glømt PIN-koden?', text: 'Spør ein admin, så får du ein ny.' },
    bestOf: { label: 'Kor mange sett?', text: 'Kor mange sett dåkke kan spela. Best av 3 betyr at den som vinne 2 sett, vinne kampen.' },
    ruleFile: { label: 'Ka betyr dei?', text: 'Vanlig e vanlig Blobby Volley. Resten e tulleregla som følge med spelet. Motstandaren ser reglå før han svare.' },
    scoreToWin: { label: 'Kor mange poeng?', text: 'Kor mange poeng som trengs for å vinna eit sett. Den som når talet først med minst 2 poengs leiing, vinne settet.' },
    speed: { label: 'Kor fort?', text: 'Kor fort Blobby Volley går, i bilde i sekundet. Høgare tal går fortare.' },
    stake: { label: 'Koss funke potten?', text: 'Vinne spelaren du satsa på, får du ein del av heile potten. Jo meir du satsa, jo større del. Tape spelaren, e innsatsen borte.' },
} as const;
