import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ColorScheme = 'ocean' | 'crimson' | 'stone' | 'forest' | 'sunset' | 'mono';
export type ThemeMode = 'light' | 'dark';
export type CarouselMode = 'slide' | 'fade';
export type ContentWidth = 'narrow' | 'normal' | 'wide';
export type SidebarSide = 'left' | 'right';

export type SidebarState = {
    open: boolean;
    pinned: boolean;
    panel: number;
};

export type ThemeProviderDefaults = Partial<{
    theme: ThemeMode;
    scheme: ColorScheme;
    left: Partial<SidebarState>;
    right: Partial<SidebarState>;
}>;

type ThemeState = {
    theme: ThemeMode;
    scheme: ColorScheme;
    carouselMode: CarouselMode;
    contentWidth: ContentWidth;
    left: SidebarState;
    right: SidebarState;
    sidebarWidthLeft: number;
    sidebarWidthRight: number;
};

type InternalThemeState = ThemeState & {
    savedLeft: SidebarState;
    savedRight: SidebarState;
};

type ThemeContextValue = ThemeState & {
    toggleTheme: () => void;
    setTheme: (theme: ThemeMode) => void;
    setScheme: (scheme: ColorScheme) => void;
    setCarouselMode: (mode: CarouselMode) => void;
    setContentWidth: (width: ContentWidth) => void;
    toggleSidebar: (side: SidebarSide) => void;
    pinSidebar: (side: SidebarSide) => void;
    closeSidebars: () => void;
    setPanel: (side: SidebarSide, index: number) => void;
    setSidebarWidth: (side: SidebarSide, width: number, snap?: boolean) => void;
};

export type ThemeProviderProps = {
    children: ReactNode;
    storageKey?: string;
    topnavHeight?: string;
    defaults?: ThemeProviderDefaults;
};

const DEFAULT_STORAGE_KEY = 'laradcs-state';
const DEFAULT_TOPNAV_HEIGHT = '4rem';
const PIN_BREAKPOINT = 960;
const MAX_PANELS = 8;
const SCHEMES: ColorScheme[] = ['ocean', 'crimson', 'stone', 'forest', 'sunset', 'mono'];

const defaultSide: SidebarState = { open: true, pinned: true, panel: 0 };

function clampPanel(value: unknown): number {
    const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
    return Math.max(0, Math.min(MAX_PANELS - 1, number));
}

function clampWidth(value: unknown): number {
    const number = typeof value === 'number' && Number.isFinite(value) ? value : 15;
    return Math.max(10, Math.min(100, Math.round(number)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadStoredState(storageKey: string): Record<string, unknown> {
    if (typeof window === 'undefined') return {};

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        return isRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function resolveSavedSide(stored: Record<string, unknown>, side: SidebarSide, configured: SidebarState): SidebarState {
    const prefix = side === 'left' ? 'left' : 'right';
    const open = stored[`${prefix}Open`];
    const pinned = stored[`${prefix}Pinned`];
    const panel = stored[`${prefix}Panel`];
    const hasSavedSide = open !== undefined || pinned !== undefined || panel !== undefined;

    return {
        open: open === undefined ? !hasSavedSide && configured.open : Boolean(open),
        pinned: pinned === undefined ? configured.pinned : Boolean(pinned),
        panel: clampPanel(panel ?? configured.panel),
    };
}

function visibleSide(saved: SidebarState, desktop: boolean): SidebarState {
    const pinned = saved.pinned && desktop;

    return {
        ...saved,
        pinned,
        open: pinned || (saved.open && desktop),
    };
}

function loadState(storageKey: string, providerDefaults: ThemeProviderDefaults): InternalThemeState {
    const stored = loadStoredState(storageKey);
    const desktop = typeof window !== 'undefined' && window.innerWidth >= PIN_BREAKPOINT;
    const configuredLeft = { ...defaultSide, ...providerDefaults.left };
    const configuredRight = { ...defaultSide, ...providerDefaults.right };
    const savedLeft = resolveSavedSide(stored, 'left', configuredLeft);
    const savedRight = resolveSavedSide(stored, 'right', configuredRight);
    const storedTheme = stored.theme;
    const storedScheme = stored.scheme;
    const storedCarousel = stored.carouselMode;
    const storedWidth = stored.width;

    return {
        theme: storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : (providerDefaults.theme ?? 'dark'),
        scheme:
            typeof storedScheme === 'string' && SCHEMES.includes(storedScheme as ColorScheme)
                ? (storedScheme as ColorScheme)
                : (providerDefaults.scheme ?? 'ocean'),
        carouselMode: storedCarousel === 'fade' ? 'fade' : 'slide',
        contentWidth: storedWidth === 'narrow' || storedWidth === 'wide' ? storedWidth : 'normal',
        left: visibleSide(savedLeft, desktop),
        right: visibleSide(savedRight, desktop),
        savedLeft,
        savedRight,
        sidebarWidthLeft: clampWidth(stored.sidebarWidthLeft),
        sidebarWidthRight: clampWidth(stored.sidebarWidthRight),
    };
}

function saveState(storageKey: string, state: InternalThemeState) {
    try {
        window.localStorage.setItem(
            storageKey,
            JSON.stringify({
                theme: state.theme,
                scheme: state.scheme,
                carouselMode: state.carouselMode,
                width: state.contentWidth,
                leftOpen: state.savedLeft.open,
                leftPinned: state.savedLeft.pinned,
                leftPanel: state.savedLeft.panel,
                rightOpen: state.savedRight.open,
                rightPinned: state.savedRight.pinned,
                rightPanel: state.savedRight.panel,
                sidebarWidthLeft: state.sidebarWidthLeft,
                sidebarWidthRight: state.sidebarWidthRight,
            }),
        );
    } catch {
        /* storage unavailable -- keep running with in-memory state */
    }
}

function applyThemeToDOM(theme: ThemeMode) {
    const html = document.documentElement;
    html.classList.remove('light', 'dark');
    html.classList.add(theme);
    html.style.colorScheme = theme;
}

function applySchemeToDOM(scheme: ColorScheme) {
    const html = document.documentElement;
    SCHEMES.forEach((name) => html.classList.remove(`scheme-${name}`));
    if (scheme !== 'ocean') html.classList.add(`scheme-${scheme}`);
}

function applyContentWidthToDOM(width: ContentWidth) {
    const html = document.documentElement;
    html.classList.toggle('narrow', width === 'narrow');
    html.classList.toggle('wide', width === 'wide');
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
    children,
    storageKey = DEFAULT_STORAGE_KEY,
    topnavHeight = DEFAULT_TOPNAV_HEIGHT,
    defaults = {},
}: ThemeProviderProps) {
    const [state, setState] = useState<InternalThemeState>(() => loadState(storageKey, defaults));

    useEffect(() => {
        applyThemeToDOM(state.theme);
        applySchemeToDOM(state.scheme);
        applyContentWidthToDOM(state.contentWidth);
        document.documentElement.style.setProperty('--sidebar-width-left', `${state.sidebarWidthLeft}%`);
        document.documentElement.style.setProperty('--sidebar-width-right', `${state.sidebarWidthRight}%`);
        document.documentElement.style.setProperty('--topnav-height', topnavHeight);
        saveState(storageKey, state);
    }, [state, storageKey, topnavHeight]);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => document.documentElement.classList.remove('preload'));
        return () => window.cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        const media = window.matchMedia(`(min-width: ${PIN_BREAKPOINT}px)`);
        const handler = (event: MediaQueryListEvent) => {
            setState((previous) => ({
                ...previous,
                left: event.matches ? visibleSide(previous.savedLeft, true) : { ...previous.left, open: false, pinned: false },
                right: event.matches ? visibleSide(previous.savedRight, true) : { ...previous.right, open: false, pinned: false },
            }));
        };

        media.addEventListener('change', handler);
        return () => media.removeEventListener('change', handler);
    }, []);

    const setTheme = useCallback((theme: ThemeMode) => {
        setState((previous) => ({ ...previous, theme }));
    }, []);

    const toggleTheme = useCallback(() => {
        setState((previous) => ({ ...previous, theme: previous.theme === 'dark' ? 'light' : 'dark' }));
    }, []);

    const setScheme = useCallback((scheme: ColorScheme) => {
        setState((previous) => ({ ...previous, scheme }));
    }, []);

    const setCarouselMode = useCallback((carouselMode: CarouselMode) => {
        setState((previous) => ({ ...previous, carouselMode }));
    }, []);

    const setContentWidth = useCallback((contentWidth: ContentWidth) => {
        setState((previous) => ({ ...previous, contentWidth }));
    }, []);

    const toggleSidebar = useCallback((side: SidebarSide) => {
        setState((previous) => {
            const current = previous[side];
            const savedKey = side === 'left' ? 'savedLeft' : 'savedRight';

            if (current.open) {
                const closed = { ...current, open: false, pinned: false };
                return { ...previous, [side]: closed, [savedKey]: closed };
            }

            return {
                ...previous,
                [side]: { ...current, open: true },
                [savedKey]: { ...previous[savedKey], open: true },
            };
        });
    }, []);

    const pinSidebar = useCallback((side: SidebarSide) => {
        if (!window.matchMedia(`(min-width: ${PIN_BREAKPOINT}px)`).matches) return;

        setState((previous) => {
            const current = previous[side];
            const savedKey = side === 'left' ? 'savedLeft' : 'savedRight';
            const pinning = !current.pinned;
            const next = { ...current, open: pinning, pinned: pinning };
            return { ...previous, [side]: next, [savedKey]: next };
        });
    }, []);

    const closeSidebars = useCallback(() => {
        setState((previous) => {
            const left = previous.left.pinned ? previous.left : { ...previous.left, open: false };
            const right = previous.right.pinned ? previous.right : { ...previous.right, open: false };

            return {
                ...previous,
                left,
                right,
                savedLeft: previous.left.pinned ? previous.savedLeft : { ...previous.savedLeft, open: false },
                savedRight: previous.right.pinned ? previous.savedRight : { ...previous.savedRight, open: false },
            };
        });
    }, []);

    const setPanel = useCallback((side: SidebarSide, index: number) => {
        setState((previous) => {
            const panel = clampPanel(index);
            const savedKey = side === 'left' ? 'savedLeft' : 'savedRight';
            return {
                ...previous,
                [side]: { ...previous[side], panel },
                [savedKey]: { ...previous[savedKey], panel },
            };
        });
    }, []);

    const setSidebarWidth = useCallback((side: SidebarSide, width: number, snap = true) => {
        const next = clampWidth(snap ? Math.round(width / 5) * 5 : width);
        setState((previous) => ({
            ...previous,
            [side === 'left' ? 'sidebarWidthLeft' : 'sidebarWidthRight']: next,
        }));
    }, []);

    return (
        <ThemeContext.Provider
            value={{
                theme: state.theme,
                scheme: state.scheme,
                carouselMode: state.carouselMode,
                contentWidth: state.contentWidth,
                left: state.left,
                right: state.right,
                sidebarWidthLeft: state.sidebarWidthLeft,
                sidebarWidthRight: state.sidebarWidthRight,
                toggleTheme,
                setTheme,
                setScheme,
                setCarouselMode,
                setContentWidth,
                toggleSidebar,
                pinSidebar,
                closeSidebars,
                setPanel,
                setSidebarWidth,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
}
