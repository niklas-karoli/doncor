/**
 * DONCOR WINGS PTFS - Main Logic
 * Production-ready with Supabase Integration
 */

// --- Supabase Configuration ---
// TO THE USER: Replace these with your actual Supabase URL and Anon Key
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_PUBLISHABLE_KEY';
let dbClient = null;

// Persistent state for the current user to avoid parsing the DOM
let currentUserState = {
    username: '',
    tier: '',
    miles: '0',
    avatar: ''
};

// Initialize Supabase if the library is loaded
if (typeof supabase !== 'undefined') {
    dbClient = supabase.createClient(supabaseUrl, supabaseKey);
}

// --- Auth Functions ---
async function signInWithDiscord() {
    if (!dbClient) {
        console.error("Supabase client not initialized.");
        return;
    }

    const { error } = await dbClient.auth.signInWithOAuth({
        provider: 'discord',
        options: {
            redirectTo: window.location.origin + '/discord/'
        }
    });

    if (error) console.error("Login Error:", error.message);
}

async function handleLogout() {
    if (!dbClient) return;
    await dbClient.auth.signOut();
    window.location.reload();
}

async function checkUserSession() {
    if (!dbClient) return;

    try {
        const { data: { session }, error } = await dbClient.auth.getSession();
        if (error) throw error;

        if (session) {
            const user = session.user;

            // Fallback chain for Discord Metadata
            const discordName = user.user_metadata.full_name ||
                               user.user_metadata.global_name ||
                               user.user_metadata.name ||
                               user.user_metadata.user_name ||
                               "Virtual Pilot";

            // Fetch custom profile data from 'public.profiles' table
            const { data: profile } = await dbClient
                .from('profiles')
                .select('mileage_points, status_points, tier_level')
                .eq('id', user.id)
                .single();

            currentUserState = {
                username: discordName,
                tier: profile?.tier_level || "White Wing",
                miles: (profile?.mileage_points || 0).toLocaleString(),
                avatar: user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(discordName)}&background=FFC800&color=111625`
            };

            updateAuthUI();
        }
    } catch (err) {
        console.error("Session check failed:", err.message);
    }
}

// --- UI Logic ---
function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');

    if (userProfile && loginBtn) {
        loginBtn.style.display = 'none';
        userProfile.style.display = 'flex';

        const nameEl = document.getElementById('user-name');
        const statsEl = document.getElementById('user-stats');
        const avatarEl = userProfile.querySelector('img');

        if (nameEl) nameEl.innerText = currentUserState.username;
        if (statsEl) statsEl.innerText = `Tier: ${currentUserState.tier} | ${currentUserState.miles} Miles`;
        if (avatarEl && currentUserState.avatar) avatarEl.src = currentUserState.avatar;

        // Apply dynamic tier coloring
        userProfile.classList.remove('status-silver', 'status-gold', 'status-bronze');
        const tierLower = currentUserState.tier.toLowerCase();
        if (tierLower.includes('silver')) userProfile.classList.add('status-silver');
        else if (tierLower.includes('gold')) userProfile.classList.add('status-gold');
        else if (tierLower.includes('bronze')) userProfile.classList.add('status-bronze');

        setupUserDropdown(userProfile);
    }
}

function setupUserDropdown(profileElement) {
    // Remove old listeners to prevent duplicates
    const newProfileElement = profileElement.cloneNode(true);
    profileElement.parentNode.replaceChild(newProfileElement, profileElement);

    newProfileElement.addEventListener('click', (e) => {
        e.stopPropagation();
        const existingDropdown = document.getElementById('user-dropdown');
        if (existingDropdown) {
            existingDropdown.remove();
        } else {
            renderDropdown(newProfileElement);
        }
    });
}

function renderDropdown(parent) {
    const dropdown = document.createElement('div');
    dropdown.id = 'user-dropdown';
    dropdown.className = 'user-dropdown-menu';

    dropdown.innerHTML = `
        <div class="dropdown-header">
            <span class="user-name-large">${currentUserState.username}</span>
            <span class="user-tier-badge">${currentUserState.tier}</span>
        </div>
        <div class="dropdown-divider"></div>
        <div class="dropdown-info">
            <div class="info-item">
                <span class="label">Current Balance</span>
                <span class="value">${currentUserState.miles} Miles</span>
            </div>
        </div>
        <div class="dropdown-divider"></div>
        <button id="logout-link" class="dropdown-item logout-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Logout</span>
        </button>
    `;

    parent.appendChild(dropdown);

    const logoutBtn = dropdown.querySelector('#logout-link');
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleLogout();
    });

    // Close on click outside
    setTimeout(() => {
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target) && !parent.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        document.addEventListener('click', closeDropdown);
    }, 10);
}

// --- Stats Animation ---
function animateStats() {
    const stats = document.querySelectorAll('.stat-number');

    stats.forEach(stat => {
        const target = +stat.getAttribute('data-target');
        const suffix = stat.getAttribute('data-suffix') || "";
        const duration = 2000;
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
    checkUserSession();
    initMobileMenu();

    const loginBtns = document.querySelectorAll('#login-btn, .btn-primary:not(header .btn-primary)');
    loginBtns.forEach(btn => {
        if (btn.innerText.toLowerCase().includes('discord') || btn.id === 'login-btn') {
            btn.addEventListener('click', (e) => {
                if (btn.getAttribute('href') === '#' || !btn.getAttribute('href')) {
                    e.preventDefault();
                    signInWithDiscord();
                }
            });
        }
    });

    if (document.querySelector('.stat-number')) {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                animateStats();
                observer.disconnect();
            }
        });
        const target = document.querySelector('.stats-grid');
        if (target) observer.observe(target);
    }

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
