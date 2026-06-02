const translations = {
    en: {
        "modal-title": "Choose your language",
        "nav-home": "Home",
        "nav-fleet": "Fleet",
        "nav-destinations": "Destinations",
        "nav-miles": "Miles",
        "nav-discord": "Join Discord",
        "hero-title": "The Most Professional RP Airline",
        "hero-subtitle": "Experience high-end aviation roleplay with Doncor PTFS. Fly to your dream destinations with our modern fleet.",
        "hero-cta": "Start Your Journey",
        "fleet-title": "Our Active Fleet",
        "fleet-a321-name": "Airbus A321neo",
        "fleet-a321-desc": "The workhorse of our short and medium-haul routes, offering efficiency and comfort.",
        "fleet-a330-name": "Airbus A330neo",
        "fleet-a330-desc": "Our long-haul flagship, bringing you to the most beautiful places in the world.",
        "destinations-title": "Top Destinations",
        "miles-title": "Doncor Miles Program",
        "miles-desc": "Join our frequent flyer program and earn miles on every flight. Unlock exclusive rewards and ranks within our community.",
        "miles-cta": "Check Miles",
        "discord-title": "Join Our Community",
        "discord-desc": "Connect with thousands of aviation enthusiasts. Book flights, apply for jobs, and participate in daily events on our Discord server.",
        "discord-cta": "Join Server",
        "legal-notice": "Doncor PTFS is a fictional roleplay community for Roblox/PTFS. This website is purely for entertainment purposes. We have no official affiliation, connection, or endorsement with or by Condor Flugdienst GmbH or any real-world airline.",
        "book-now": "Book Now"
    },
    de: {
        "modal-title": "Wählen Sie Ihre Sprache",
        "nav-home": "Startseite",
        "nav-fleet": "Flotte",
        "nav-destinations": "Ziele",
        "nav-miles": "Meilen",
        "nav-discord": "Discord beitreten",
        "hero-title": "Die professionellste RP-Airline",
        "hero-subtitle": "Erleben Sie High-End-Aviation-Roleplay mit Doncor PTFS. Fliegen Sie mit unserer modernen Flotte zu Ihren Traumzielen.",
        "hero-cta": "Reise starten",
        "fleet-title": "Unsere aktive Flotte",
        "fleet-a321-name": "Airbus A321neo",
        "fleet-a321-desc": "Das Arbeitspferd für unsere Kurz- und Mittelstrecken, effizient und komfortabel.",
        "fleet-a330-name": "Airbus A330neo",
        "fleet-a330-desc": "Unser Langstrecken-Flaggschiff, das Sie zu den schönsten Orten der Welt bringt.",
        "destinations-title": "Top-Reiseziele",
        "miles-title": "Doncor Meilen-Programm",
        "miles-desc": "Werden Sie Mitglied in unserem Vielfliegerprogramm und sammeln Sie bei jedem Flug Meilen. Schalten Sie exklusive Belohnungen und Ränge frei.",
        "miles-cta": "Meilen prüfen",
        "discord-title": "Tritt unserer Community bei",
        "discord-desc": "Verbinde dich mit Tausenden von Luftfahrtbegeisterten. Buche Flüge, bewirb dich um Jobs und nimm an täglichen Events auf unserem Discord-Server teil.",
        "discord-cta": "Server beitreten",
        "legal-notice": "Doncor PTFS ist eine fiktive Rollenspiel-Community für Roblox/PTFS. Diese Website dient rein zu Unterhaltungszwecken. Wir haben keine offizielle Verbindung, Verbindung oder Unterstützung durch die Condor Flugdienst GmbH oder eine andere reale Fluggesellschaft.",
        "book-now": "Jetzt buchen"
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const languageModal = document.getElementById('language-modal');
    const langEnBtn = document.getElementById('lang-en');
    const langDeBtn = document.getElementById('lang-de');
    const langToggleBtn = document.getElementById('lang-toggle');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('nav-links');

    // --- Language Logic ---
    function setLanguage(lang) {
        localStorage.setItem('doncor_lang', lang);
        document.documentElement.lang = lang;

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (translations[lang][key]) {
                element.innerText = translations[lang][key];
            }
        });

        // Update language toggle button text
        if (langToggleBtn) {
            langToggleBtn.innerText = lang === 'en' ? 'DE' : 'EN';
        }

        // Hide modal if it's open
        if (languageModal) {
            languageModal.style.display = 'none';
        }
    }

    // Check for saved language or show modal
    const savedLang = localStorage.getItem('doncor_lang');
    if (savedLang) {
        setLanguage(savedLang);
        if (languageModal) languageModal.style.display = 'none';
    } else {
        if (languageModal) languageModal.style.display = 'flex';
    }

    // Modal buttons
    if (langEnBtn) {
        langEnBtn.addEventListener('click', () => setLanguage('en'));
    }
    if (langDeBtn) {
        langDeBtn.addEventListener('click', () => setLanguage('de'));
    }

    // Header toggle button
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            const currentLang = localStorage.getItem('doncor_lang') || 'en';
            setLanguage(currentLang === 'en' ? 'de' : 'en');
        });
    }

    // --- Mobile Menu Logic ---
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            mobileMenuBtn.classList.toggle('open');
        });

        // Close menu when a link is clicked
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                mobileMenuBtn.classList.remove('open');
            });
        });
    }

    // --- Smooth Scrolling ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');

            // Ignore empty hashes or non-anchor links
            if (href === '#' || href === '') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});
