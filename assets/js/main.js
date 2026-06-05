/**
 * DONCOR WINGS PTFS - Main Logic
 * Production-ready with Supabase Integration
 */

// --- Supabase Configuration ---
// TO THE USER: Replace these with your actual Supabase URL and Anon Key
const supabaseUrl = 'https://cqybjgwbehmjpeecqkbq.supabase.co';
const supabaseKey = 'sb_publishable_8jrQCtGf-KaQR1s7avn4ew_RJcuBSfz';
let dbClient = null;

// Initialize Supabase if the library is loaded
if (typeof supabase !== 'undefined') {
    // The CDN version exposes 'supabase' as the main object
    if (supabase.createClient) {
        dbClient = supabase.createClient(supabaseUrl, supabaseKey);
    }
}

// --- Auth Functions ---
async function signInWithDiscord() {
    if (!dbClient) return;
    console.log("Supabase: Initiating Discord OAuth2 flow...");

    const { data, error } = await dbClient.auth.signInWithOAuth({
        provider: 'discord',
        options: {
            redirectTo: window.location.origin + (window.location.pathname.includes('/discord/') ? '/discord/' : '/')
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

    const { data: { session }, error } = await dbClient.auth.getSession();

    if (session) {
        const user = session.user;
        const discordName = user.user_metadata.full_name || user.user_metadata.custom_claims?.global_name || "Virtual Pilot";

        // Fetch custom profile data from 'profiles' table
        const { data: profile, error: profileError } = await dbClient
            .from('profiles')
            .select('mileage_points, status_points, tier_level')
            .eq('id', user.id)
            .single();

        if (profile) {
            updateAuthUI({
                username: discordName,
                tier: profile.tier_level || "White Wing",
                miles: (profile.mileage_points || 0).toLocaleString()
            });
        } else {
            // Fallback if profile trigger is still processing
            updateAuthUI({
                username: discordName,
                tier: "White Wing",
                miles: "0"
            });
        }
    }
}

// --- UI Logic ---
function updateAuthUI(user) {
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');

    if (user && userProfile && loginBtn) {
        loginBtn.style.display = 'none';
        userProfile.style.display = 'flex';

        const nameEl = document.getElementById('user-name');
        const statsEl = document.getElementById('user-stats');

        if (nameEl) nameEl.innerText = user.username;
        if (statsEl) statsEl.innerText = `Tier: ${user.tier} | ${user.miles} Miles`;

        // Apply dynamic tier coloring
        userProfile.classList.remove('status-silver', 'status-gold', 'status-bronze');
        const tierLower = user.tier.toLowerCase();
        if (tierLower.includes('silver')) userProfile.classList.add('status-silver');
        else if (tierLower.includes('gold')) userProfile.classList.add('status-gold');
        else if (tierLower.includes('bronze')) userProfile.classList.add('status-bronze');
    }
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
    checkUserSession();
    initMobileMenu();

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signInWithDiscord();
        });
    }

    const userProfile = document.getElementById('user-profile');
    if (userProfile) {
        userProfile.addEventListener('click', () => {
            if (confirm("Do you want to log out?")) {
                handleLogout();
            }
        });
    }

    // Trigger stats animation if we are on the discord page
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
