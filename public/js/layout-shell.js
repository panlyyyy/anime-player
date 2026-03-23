/** PWA: daftar service worker untuk install di HP */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        let hasRefreshedForUpdate = false;
        navigator.serviceWorker.register('/sw.js?v=20260323-1', {
            updateViaCache: 'none'
        }).then((registration) => {
            registration.update().catch(() => {});
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (hasRefreshedForUpdate) return;
                hasRefreshedForUpdate = true;
                window.location.reload();
            });
        }).catch(() => {});
    });
}

/** Navbar background on scroll (NimeStream-style top nav) */
document.addEventListener('DOMContentLoaded', () => {
    const header = document.getElementById('mainHeader');
    if (!header) return;
    const onScroll = () => {
        if (window.scrollY > 20) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
});
