// The help behind the i buttons of the player forms, in the jokey Rogaland dialect of the LAN.
// The label of each button is a question, so it never holds the words of the field label.

export const FIELD_INFO = {
    code: { label: 'Kor finne eg koden?', text: 'Koden står på storskjermen i lokalet, eller spør ein admin. Han sørge for at bare dei som e på LANet, kan bli med.' },
    nickname: { label: 'Ka slags navn?', text: 'Velg eit navn dei andre kjenne deg igjen på. Det vises i spelet, på topplistå og på storskjermen, og du logge inn med det.' },
    pin: { label: 'Ka e PIN-en te?', text: 'Fire siffer du finne på sjøl. Du treng han for å logga inn igjen, så bruk ikkje ein kode du har andre stader.' },
    signInNickname: { label: 'Ka slags navn?', text: 'Kallenavnet du valgte då du blei med. Store og små bokstava e det same.' },
    signInPin: { label: 'Glømt PIN-en?', text: 'Dei fire siffera du valgte då du blei med. Har du glømt han, kan ein admin nullstilla han.' },
    bestOf: { label: 'Kor mange sett?', text: 'Kor mange sett dåkke kan spela. Best av 3 betyr at den som vinne 2 sett, vinne kampen.' },
    scoreToWin: { label: 'Kor mange poeng?', text: 'Kor mange poeng som trengs for å vinna eit sett.' },
    speed: { label: 'Kor fort?', text: 'Kor fort spelet går, i bilde i sekundet. Høgare tal går fortare.' },
    stake: { label: 'Koss funke potten?', text: 'Kor mange Foza du sette på spelaren du velge. Vinne han, får du din del av potten. Tape han, e innsatsen borte.' },
} as const;
