'use client';

import { useEffect, useRef, useState } from 'react';
import { randomEventCode, randomSuffix, suggestEventCode } from '@/lib/events/code';

/**
 * The event code field with a Generate button. With `followName`, the code follows the name field
 * until the admin types a code or presses Generate. The random end of that code is made once, so it
 * stays the same while the admin types. The field always stays editable.
 */
export function EventCodeField({ initial, followName }: { initial: string; followName: boolean }) {
    const [code, setCode] = useState(initial);
    const [own, setOwn] = useState(!followName);
    const [suffix] = useState(randomSuffix);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (own) return;
        const name = input.current?.form?.elements.namedItem('name');
        if (!(name instanceof HTMLInputElement)) return;
        const follow = () => setCode(name.value.trim() === '' ? initial : suggestEventCode(name.value, suffix));
        name.addEventListener('input', follow);
        return () => name.removeEventListener('input', follow);
    }, [own, initial, suffix]);

    return (
        <p>
            <label>
                Event code{' '}
                <input
                    ref={input}
                    name="code"
                    required
                    minLength={8}
                    maxLength={32}
                    autoComplete="off"
                    spellCheck={false}
                    value={code}
                    onChange={(event) => {
                        setCode(event.target.value);
                        setOwn(true);
                    }}
                />
            </label>{' '}
            <button
                type="button"
                onClick={() => {
                    setCode(randomEventCode());
                    setOwn(true);
                }}
            >
                Generate
            </button>
        </p>
    );
}
