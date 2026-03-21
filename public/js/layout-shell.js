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
