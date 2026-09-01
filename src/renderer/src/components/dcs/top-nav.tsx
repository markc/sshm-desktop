import type { ReactNode } from 'react';

export default function TopNav({ children }: { children: ReactNode }) {
    return (
        <header
            className="flex h-[var(--topnav-height)] items-center justify-center border-b"
            style={{
                background: 'var(--scheme-bg-secondary)',
                borderColor: 'var(--scheme-border)',
            }}
        >
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--scheme-accent)' }}>
                {children}
            </h1>
        </header>
    );
}
