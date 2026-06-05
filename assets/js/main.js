/**
 * DONCOR WINGS PTFS - Main Logic
 * Prepared for Supabase Integration
 */

// --- Supabase Mock / Placeholder Functions ---
async function signUpWithDiscord() {
    console.log("Supabase: Initiating Discord OAuth2 flow...");
    // Future: const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'discord' })

    // For now: Simulate a successful login
    simulateLogin();
}

async function checkUserSession() {
    console.log("Supabase: Checking active session...");
    // Future: const { data: { session } } = await supabase.auth.getSession()
    return null;
}

// --- UI Logic ---
function simulateLogin() {
    localStorage.setItem('doncor_mock_user', JSON.stringify({
        username: "Capt_Roblox",
        tier: "Bronze Aviator",
        miles: "2,800"
    }));
    updateAuthUI();
}

function updateAuthUI() {
    const user = JSON.parse(localStorage.getItem('doncor_mock_user'));
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');

    if (user && userProfile && loginBtn) {
        loginBtn.style.display = 'none';
        userProfile.style.display = 'flex';
        document.getElementById('user-name').innerText = user.username;
        document.getElementById('user-stats').innerText = `Tier: ${user.tier} | ${user.miles} Miles`;
    }
}

function logout() {
    localStorage.removeItem('doncor_mock_user');
    window.location.reload();
}

// --- Stats Animation ---
function animateStats() {
    const stats = document.querySelectorAll('.stat-number');

    stats.forEach(stat => {
        const target = +stat.getAttribute('data-target');
        const suffix = stat.getAttribute('data-suffix') || "";
        const duration = 2000; // 2 seconds
        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            stat.innerText = Math.floor(progress * target) + suffix;
            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    });
}

// --- Mobile Menu ---
function initMobileMenu() {
    const toggle = document.getElementById('mobile-toggle');
    const nav = document.getElementById('nav-menu');

    if (toggle && nav) {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('active');
            nav.classList.toggle('active');
        });

        // Close menu when clicking a link
        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                toggle.classList.remove('active');
                nav.classList.remove('active');
            });
        });
    }
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    initMobileMenu();

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signUpWithDiscord();
        });
    }

    const userProfile = document.getElementById('user-profile');
    if (userProfile) {
        userProfile.addEventListener('click', () => {
            if (confirm("Do you want to log out?")) {
                logout();
            }
        });
    }

    // Trigger stats animation if we are on the discord page
    if (document.querySelector('.stat-number')) {
        // Simple Intersection Observer to start animation when visible
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                animateStats();
                observer.disconnect();
            }
        });
        observer.observe(document.querySelector('.stats-grid'));
    }

    // Smooth Scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});
