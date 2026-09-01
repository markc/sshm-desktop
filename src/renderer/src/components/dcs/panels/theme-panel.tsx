import { useTheme, type CarouselMode, type ColorScheme, type ContentWidth, type SidebarSide, type ThemeMode } from '@/contexts/theme-context';
import { useEffect, useState } from 'react';

const schemes: { id: ColorScheme; label: string; swatch: string }[] = [
    { id: 'ocean', label: 'Ocean', swatch: 'oklch(50% 0.12 220)' },
    { id: 'crimson', label: 'Crimson', swatch: 'oklch(47% 0.2 25)' },
    { id: 'stone', label: 'Stone', swatch: 'oklch(45% 0.05 60)' },
    { id: 'forest', label: 'Forest', swatch: 'oklch(49% 0.12 150)' },
    { id: 'sunset', label: 'Sunset', swatch: 'oklch(52% 0.16 45)' },
    { id: 'mono', label: 'Mono', swatch: 'oklch(50% 0 0)' },
];

function ToggleGroup<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <div className="toggle-group flex overflow-hidden rounded-md border" style={{ borderColor: 'var(--scheme-border)' }}>
            {options.map((option) => (
                <button
                    type="button"
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    className="toggle-btn flex-1 px-3 py-1.5 text-sm font-medium transition-colors"
                    style={{
                        background: value === option.value ? 'var(--scheme-accent)' : 'transparent',
                        color: value === option.value ? 'var(--scheme-accent-fg)' : 'var(--scheme-fg-muted)',
                    }}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function WidthSpinner({ side, value }: { side: SidebarSide; value: number }) {
    const { setSidebarWidth } = useTheme();
    const [draft, setDraft] = useState(String(value));

    useEffect(() => setDraft(String(value)), [value]);

    const commit = () => {
        const number = Number(draft);
        if (Number.isFinite(number)) setSidebarWidth(side, number);
        else setDraft(String(value));
    };

    return (
        <div className="sidebar-width-control min-w-0 flex-1">
            <label
                htmlFor={`sidebar-width-${side}-input`}
                className="mb-1 block text-center text-sm whitespace-nowrap"
                style={{ color: 'var(--scheme-fg-secondary)' }}
            >
                {side === 'left' ? 'Left %' : 'Right %'}
            </label>
            <input
                id={`sidebar-width-${side}-input`}
                type="number"
                min={10}
                max={100}
                step={5}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                }}
                className="sidebar-width-spinner min-h-9 w-full rounded-md border bg-transparent p-0 text-center text-sm tabular-nums"
                style={{ borderColor: 'var(--scheme-border)', color: 'var(--scheme-fg-primary)' }}
            />
        </div>
    );
}

export default function ThemePanel() {
    const { theme, scheme, carouselMode, contentWidth, sidebarWidthLeft, sidebarWidthRight, setTheme, setScheme, setCarouselMode, setContentWidth } =
        useTheme();

    return (
        <div className="appearance-section space-y-4 p-4">
            <ToggleGroup<ThemeMode>
                options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                ]}
                value={theme}
                onChange={setTheme}
            />

            <ToggleGroup<CarouselMode>
                options={[
                    { value: 'slide', label: 'Slide' },
                    { value: 'fade', label: 'Fade' },
                ]}
                value={carouselMode}
                onChange={setCarouselMode}
            />

            <ToggleGroup<ContentWidth>
                options={[
                    { value: 'narrow', label: 'Narrow' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'wide', label: 'Wide' },
                ]}
                value={contentWidth}
                onChange={setContentWidth}
            />

            <div className="sidebar-width-controls flex gap-3">
                <WidthSpinner side="left" value={sidebarWidthLeft} />
                <WidthSpinner side="right" value={sidebarWidthRight} />
            </div>

            <div className="scheme-list space-y-1">
                {schemes.map((item) => {
                    const active = scheme === item.id;
                    return (
                        <button
                            type="button"
                            key={item.id}
                            onClick={() => setScheme(item.id)}
                            className="scheme-item flex w-full items-center gap-3 rounded-md border-2 px-3 py-2 text-sm transition-colors"
                            style={{
                                background: active ? 'var(--scheme-accent-subtle)' : undefined,
                                color: active ? 'var(--scheme-accent)' : 'var(--scheme-fg-secondary)',
                                borderColor: active ? 'var(--scheme-accent)' : 'transparent',
                                fontWeight: active ? 500 : undefined,
                            }}
                        >
                            <span className="h-[1.125rem] w-[1.125rem] shrink-0 rounded-full" style={{ background: item.swatch }} />
                            <span className="scheme-name">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
