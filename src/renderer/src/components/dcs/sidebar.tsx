import PanelCarousel from '@/components/dcs/panel-carousel';
import { useTheme } from '@/contexts/theme-context';
import { Pin, PinOff } from 'lucide-react';
import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';

interface SidebarProps {
    side: 'left' | 'right';
    panels: { label: string; content: ReactNode }[];
}

const MIN_WIDTH = 10;
const MAX_WIDTH = 100;

export default function Sidebar({ side, panels }: SidebarProps) {
    const theme = useTheme();
    const state = theme[side];
    const dragging = useRef(false);
    const dragWidth = useRef<number | null>(null);

    // Drag the inner edge as a percentage of the viewport. The CSS variable updates
    // live without React churn; the final whole-percent value persists on release.
    const widthFor = (clientX: number) => {
        const raw = side === 'left' ? (clientX / window.innerWidth) * 100 : ((window.innerWidth - clientX) / window.innerWidth) * 100;
        return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(raw)));
    };
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        dragging.current = true;
        dragWidth.current = null;
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.classList.add('dcs-resizing');
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        const width = widthFor(e.clientX);
        dragWidth.current = width;
        document.documentElement.style.setProperty(`--sidebar-width-${side}`, `${width}%`);
    };
    const endDrag = () => {
        if (!dragging.current) return;
        dragging.current = false;
        document.body.classList.remove('dcs-resizing');
        if (dragWidth.current !== null) theme.setSidebarWidth(side, dragWidth.current, false);
        dragWidth.current = null;
    };

    return (
        <aside
            className={`sidebar-${side} sidebar-slide page-fade-in fixed top-0 ${side === 'left' ? 'left-0' : 'right-0'} z-30 flex h-screen flex-col ${side === 'left' ? 'w-[var(--sw-l)]' : 'w-[var(--sw-r)]'} ${
                state.open ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full'
            }`}
            style={{
                background: 'var(--scheme-bg-secondary)',
                containerType: 'inline-size',
            }}
        >
            <PanelCarousel
                panels={panels}
                activePanel={state.panel}
                onPanelChange={(i) => theme.setPanel(side, i)}
                side={side}
                headerSlot={
                    <button
                        onClick={() => theme.pinSidebar(side)}
                        className="hover:bg-background pin:block hidden rounded p-1 transition-colors"
                        style={{ color: state.pinned ? 'var(--scheme-accent)' : 'var(--scheme-fg-muted)' }}
                        aria-label={state.pinned ? 'Unpin sidebar' : 'Pin sidebar'}
                    >
                        {state.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                }
            />
            {state.open && (
                <div
                    className="sidebar-resizer"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                />
            )}
        </aside>
    );
}
