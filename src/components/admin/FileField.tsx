'use client';

import { useId, useState } from 'react';

/**
 * A file field with a Browse button and the name of the chosen file. The real input is hidden but
 * still takes focus, posts the file and checks `required`. Space or Enter on it opens the picker.
 */
export function FileField({
    label,
    name,
    accept,
    required = false,
    hint,
    onFileChange,
}: {
    label: string;
    name: string;
    accept: string;
    required?: boolean;
    hint?: string;
    onFileChange?: (file: File | null) => void;
}) {
    const [fileName, setFileName] = useState<string | null>(null);
    const id = useId();
    return (
        <div className="admin-field">
            <label id={`${id}-label`} htmlFor={id}>
                {label}
            </label>
            <div className="admin-file">
                <input
                    id={id}
                    name={name}
                    type="file"
                    accept={accept}
                    required={required}
                    aria-labelledby={`${id}-label`}
                    aria-describedby={hint ? `${id}-name ${id}-hint` : `${id}-name`}
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0] ?? null;
                        setFileName(file?.name ?? null);
                        onFileChange?.(file);
                    }}
                />
                <label htmlFor={id} className="admin-file-button" aria-hidden="true">
                    Browse
                </label>
                <span id={`${id}-name`} className="admin-file-name">
                    {fileName ?? 'No file chosen'}
                </span>
            </div>
            {hint && (
                <span id={`${id}-hint`} className="admin-hint">
                    {hint}
                </span>
            )}
        </div>
    );
}
