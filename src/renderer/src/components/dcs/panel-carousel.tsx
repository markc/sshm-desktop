import { useTheme } from '@/contexts/theme-context';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

type PanelDef = {
    label: string;
    content: ReactNode;
};

type PanelCarouselProps = {
    panels: PanelDef[];
    activePanel: number;
    onPanelChange: (index: number) => void;
    side: 'left' | 'right';
    headerSlot?: ReactNode;
};

type WrapCleanup = {
    timer: number;
    panel: HTMLDivElement;
};

function displayName(label: string) {
    return label.replace(/^[LR]\d+:\s*/, '');
}

export default function PanelCarousel({ panels, activePanel, onPanelChange, side, headerSlot }: PanelCarouselProps) {
    const { carouselMode } = useTheme();
    const count = panels.length;
    const activeIndex = count === 0 ? 0 : ((activePanel % count) + count) % count;
    const trackRef = useRef<HTMLDivElement>(null);
    const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
    const previousMode = useRef(carouselMode);
    const wrapCleanup = useRef<WrapCleanup | null>(null);
    const wrapping = useRef(false);

    // Switch modes without animating the mode change itself.
    useEffect(() => {
        const track = trackRef.current;
        if (!track || previousMode.current === carouselMode) return;
        const panelElements = panelRefs.current;

        if (wrapCleanup.current) {
            window.clearTimeout(wrapCleanup.current.timer);
            wrapCleanup.current.panel.style.transform = '';
            wrapCleanup.current = null;
            wrapping.current = false;
        }

        track.style.transition = 'none';
        panelElements.forEach((panel) => {
            if (panel) panel.style.transition = 'none';
        });

        if (carouselMode === 'fade') {
            track.style.display = 'grid';
            track.style.transform = '';
            panelElements.forEach((panel, index) => {
                if (!panel) return;
                panel.style.transform = '';
                panel.style.gridArea = '1 / 1';
                panel.style.width = '';
                panel.style.flexShrink = '';
                panel.style.opacity = index === activeIndex ? '1' : '0';
                panel.style.pointerEvents = index === activeIndex ? 'auto' : 'none';
            });
        } else {
            track.style.display = 'flex';
            track.style.transform = `translateX(-${activeIndex * 100}%)`;
            panelElements.forEach((panel) => {
                if (!panel) return;
                panel.style.transform = '';
                panel.style.gridArea = '';
                panel.style.width = '100%';
                panel.style.flexShrink = '0';
                panel.style.opacity = '1';
                panel.style.pointerEvents = 'auto';
            });
        }

        void track.offsetHeight;
        track.style.transition = '';
        panelElements.forEach((panel) => {
            if (panel) panel.style.transition = '';
        });
        previousMode.current = carouselMode;
    }, [activeIndex, carouselMode]);

    useEffect(() => {
        const track = trackRef.current;
        if (!track || wrapping.current) return;

        if (carouselMode === 'fade') {
            panelRefs.current.forEach((panel, index) => {
                if (!panel) return;
                panel.style.opacity = index === activeIndex ? '1' : '0';
                panel.style.pointerEvents = index === activeIndex ? 'auto' : 'none';
            });
        } else {
            track.style.transform = `translateX(-${activeIndex * 100}%)`;
        }
    }, [activeIndex, carouselMode]);

    useEffect(
        () => () => {
            if (wrapCleanup.current) window.clearTimeout(wrapCleanup.current.timer);
        },
        [],
    );

    const cancelWrap = () => {
        const track = trackRef.current;
        const cleanup = wrapCleanup.current;
        if (!track || !cleanup) return;

        window.clearTimeout(cleanup.timer);
        track.style.transition = 'none';
        cleanup.panel.style.transform = '';
        track.style.transform = `translateX(-${activeIndex * 100}%)`;
        void track.offsetHeight;
        track.style.transition = '';
        wrapCleanup.current = null;
        wrapping.current = false;
    };

    const changePanel = (requestedIndex: number, directional: boolean) => {
        if (count === 0) return;
        cancelWrap();

        const normalized = ((requestedIndex % count) + count) % count;
        const track = trackRef.current;
        const wrapForward = directional && requestedIndex >= count;
        const wrapBack = directional && requestedIndex < 0;

        if (carouselMode === 'slide' && track && (wrapForward || wrapBack)) {
            const destination = panelRefs.current[normalized];
            if (destination) {
                destination.style.transform = wrapForward ? `translateX(${count * 100}%)` : `translateX(-${count * 100}%)`;
                void track.offsetHeight;
                wrapping.current = true;
                track.style.transform = wrapForward ? `translateX(-${count * 100}%)` : 'translateX(100%)';
                onPanelChange(normalized);

                const timer = window.setTimeout(() => {
                    track.style.transition = 'none';
                    destination.style.transform = '';
                    track.style.transform = `translateX(-${normalized * 100}%)`;
                    void track.offsetHeight;
                    track.style.transition = '';
                    wrapCleanup.current = null;
                    wrapping.current = false;
                }, 320);
                wrapCleanup.current = { timer, panel: destination };
                return;
            }
        }

        onPanelChange(normalized);
    };

    if (count === 0) return null;

    if (count === 1) {
        return (
            <>
                <div
                    className="flex h-[var(--sidebar-header-height)] shrink-0 items-center border-b px-2"
                    style={{ borderColor: 'var(--scheme-border)' }}
                >
                    {side === 'left' && headerSlot}
                    <h2 className="flex-1 text-center text-sm font-bold" style={{ color: 'var(--scheme-fg-primary)' }}>
                        {displayName(panels[0].label)}
                    </h2>
                    {side === 'right' && headerSlot}
                </div>
                <div className={`min-h-0 flex-1 overflow-y-auto ${side === 'right' ? 'overflow-x-hidden' : ''}`}>{panels[0].content}</div>
            </>
        );
    }

    const isFade = carouselMode === 'fade';

    return (
        <>
            <div
                className={`carousel-header flex h-[var(--sidebar-header-height)] shrink-0 items-center gap-1 border-b px-2 ${
                    side === 'left' ? 'justify-start' : 'justify-end'
                }`}
                style={{ borderColor: 'var(--scheme-border)' }}
            >
                {side === 'left' && headerSlot}
                <div className="carousel-nav flex items-center gap-1.5">
                    <button
                        onClick={() => changePanel(activeIndex - 1, true)}
                        className="hover:bg-background rounded p-0.5 transition-colors"
                        style={{ color: 'var(--scheme-fg-muted)', fontSize: 22 }}
                        aria-label="Previous panel"
                    >
                        <ChevronLeft className="h-[1em] w-[1em]" />
                    </button>
                    <div className="carousel-dots flex items-center gap-1.5">
                        {panels.map((panel, index) => (
                            <button
                                key={panel.label}
                                onClick={() => changePanel(index, false)}
                                className="carousel-dot transition-all"
                                style={{
                                    width: index === activeIndex ? 24 : 9,
                                    height: 9,
                                    borderRadius: 5,
                                    backgroundColor: index === activeIndex ? 'var(--scheme-accent)' : 'var(--scheme-fg-muted)',
                                    opacity: index === activeIndex ? 1 : 0.4,
                                }}
                                aria-label={panel.label}
                            />
                        ))}
                    </div>
                    <button
                        onClick={() => changePanel(activeIndex + 1, true)}
                        className="hover:bg-background rounded p-0.5 transition-colors"
                        style={{ color: 'var(--scheme-fg-muted)', fontSize: 22 }}
                        aria-label="Next panel"
                    >
                        <ChevronRight className="h-[1em] w-[1em]" />
                    </button>
                </div>
                {side === 'right' && headerSlot}
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div
                    ref={trackRef}
                    className="h-full"
                    style={{
                        display: isFade ? 'grid' : 'flex',
                        transition: isFade ? 'none' : 'transform 0.3s ease-in-out',
                    }}
                >
                    {panels.map((panel, index) => {
                        const active = index === activeIndex;
                        return (
                            <div
                                key={panel.label}
                                ref={(element) => {
                                    panelRefs.current[index] = element;
                                }}
                                className={`flex h-full min-h-0 flex-col ${side === 'right' ? 'min-w-0' : ''}`}
                                style={
                                    isFade
                                        ? {
                                              gridArea: '1 / 1',
                                              opacity: active ? 1 : 0,
                                              pointerEvents: active ? 'auto' : 'none',
                                              transition: 'opacity 0.3s ease-in-out',
                                          }
                                        : {
                                              width: '100%',
                                              flexShrink: 0,
                                              opacity: 1,
                                              pointerEvents: 'auto',
                                          }
                                }
                            >
                                <div
                                    className="shrink-0 border-b px-4 py-2 text-center"
                                    style={{
                                        borderColor: 'var(--scheme-border)',
                                        background: 'color-mix(in oklch, var(--scheme-accent) 4%, transparent)',
                                    }}
                                    title={panel.label}
                                >
                                    <h2 className="text-sm font-bold" style={{ color: 'var(--scheme-fg-primary)' }}>
                                        {displayName(panel.label)}
                                    </h2>
                                </div>
                                <div className={`min-h-0 flex-1 overflow-y-auto ${side === 'right' ? 'overflow-x-hidden' : ''}`}>{panel.content}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
