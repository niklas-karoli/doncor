/**
 * DONCOR WINGS PTFS - Main Logic
 * Professional Booking Hub Edition - Robust Production Build
 */

// --- Supabase Configuration ---
const supabaseUrl = 'https://cqybjgwbehmjpeecqkbq.supabase.co';
const supabaseKey = 'sb_publishable_8jrQCtGf-KaQR1s7avn4ew_RJcuBSfz';
let dbClient = null;

// Persistent state for the current user
let currentUserState = {
    id: null,
    discord_id: '',
    username: '',
    tier: 'White Wing',
    miles: 0,
    avatar: '',
    vouchers: {
        business: 0,
        first: 0
    }
};

// Application State
let appData = {
    activeFlights: [],
    airports: [],
    flightDates: [], // Strings in YYYY-MM-DD
    selectedDate: null,
    isDataLoaded: false
};

// Initialize Supabase with better error handling
function initSupabase() {
    try {
        if (typeof supabase !== 'undefined') {
            dbClient = supabase.createClient(supabaseUrl, supabaseKey);
            console.log("Supabase Client Initialized Successfully");
        } else {
            console.error("Supabase library not found. Ensure the CDN script is loaded.");
        }
    } catch (e) {
        console.error("Failed to initialize Supabase:", e.message);
    }
}

// --- Tier Logic ---
function calculateTier(miles) {
    if (miles >= 72000) return "Gold Captain (Elite)";
    if (miles >= 36000) return "Silver Commander";
    if (miles >= 12000) return "Bronze Aviator";
    return "White Wing";
}

// --- Auth Functions ---
async function signInWithDiscord() {
    if (!dbClient) {
        alert("Authentication service is currently unavailable.");
        return;
    }
    const { error } = await dbClient.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: window.location.origin + '/discord/' }
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
            const discordName = user.user_metadata.full_name || user.user_metadata.global_name || user.user_metadata.name || "Virtual Pilot";
            const discordId = user.user_metadata.provider_id || user.id;

            const { data: profile, error: profileError } = await dbClient
                .from('profiles')
                .select('mileage_points, business_vouchers, first_vouchers')
                .eq('id', user.id)
                .single();

            if (profileError) console.warn("Profile fetch error (using defaults):", profileError.message);

            const miles = profile?.mileage_points || 0;
            currentUserState = {
                id: user.id,
                discord_id: discordId,
                username: discordName,
                tier: calculateTier(miles),
                miles: miles,
                avatar: user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(discordName)}&background=FFC800&color=111625`,
                vouchers: {
                    business: profile?.business_vouchers || 0,
                    first: profile?.first_vouchers || 0
                }
            };
            updateAuthUI();
        }
    } catch (err) {
        console.error("Session check failed:", err.message);
    }
}

// --- Flight Data & Search ---
async function fetchActiveFlightData() {
    if (!dbClient) return;
    try {
        console.log("Fetching active flights...");
        const { data, error } = await dbClient
            .from('flights')
            .select('departure_airport, destination_airport, event_start');

        if (error) {
            console.error("Supabase flight fetch error:", error.message);
            return;
        }

        if (!data || data.length === 0) {
            console.warn("No active flights found in the database.");
            appData.activeFlights = [];
            appData.airports = [];
            appData.flightDates = [];
            return;
        }

        appData.activeFlights = data;

        const airportSet = new Set();
        data.forEach(f => {
            if (f.departure_airport) airportSet.add(f.departure_airport);
            if (f.destination_airport) airportSet.add(f.destination_airport);
        });
        appData.airports = Array.from(airportSet).sort();

        const dateSet = new Set();
        data.forEach(f => {
            if (f.event_start) {
                const dateStr = new Date(f.event_start).toISOString().split('T')[0];
                dateSet.add(dateStr);
            }
        });
        appData.flightDates = Array.from(dateSet);
        appData.isDataLoaded = true;
        console.log(`Loaded ${appData.airports.length} airports and ${appData.flightDates.length} flight dates.`);

    } catch (err) {
        console.error("Critical error fetching flight data:", err.message);
    }
}

function initBookingMask() {
    const depInput = document.getElementById('departure-input');
    const arrInput = document.getElementById('arrival-input');
    const dateInput = document.getElementById('date-input');
    const searchBtn = document.getElementById('search-flights-btn');

    if (depInput) setupAutocomplete(depInput, 'departure-list');
    if (arrInput) setupAutocomplete(arrInput, 'arrival-list');
    if (dateInput) setupCalendar(dateInput);

    if (searchBtn) {
        searchBtn.onclick = (e) => {
            e.preventDefault();
            performSearch(depInput.value, arrInput.value, appData.selectedDate);
        };
    }
}

function setupAutocomplete(input, listId) {
    const list = document.getElementById(listId);

    const trigger = () => {
        if (!appData.isDataLoaded) {
            list.innerHTML = '<div class="autocomplete-item">Loading data...</div>';
            list.style.display = 'block';
            return;
        }
        renderAutocomplete(input.value, list, input);
    };

    input.addEventListener('focus', trigger);
    input.addEventListener('input', trigger);

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !list.contains(e.target)) {
            list.style.display = 'none';
        }
    });
}

function renderAutocomplete(query, list, input) {
    const filtered = appData.airports.filter(a => a.toLowerCase().includes(query.toLowerCase()));
    if (filtered.length > 0) {
        list.innerHTML = filtered.map(a => `<div class="autocomplete-item">${a}</div>`).join('');
        list.style.display = 'block';
        list.querySelectorAll('.autocomplete-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                input.value = item.textContent;
                list.style.display = 'none';
            };
        });
    } else {
        list.style.display = 'none';
    }
}

function setupCalendar(input) {
    const picker = document.getElementById('calendar-picker');
    let currentMonth = new Date();
    input.onclick = (e) => {
        e.stopPropagation();
        picker.style.display = picker.style.display === 'block' ? 'none' : 'block';
        renderCalendar(currentMonth, picker, input);
    };
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !picker.contains(e.target)) {
            picker.style.display = 'none';
        }
    });
}

function renderCalendar(date, container, input) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = date.toLocaleString('default', { month: 'long' });

    let html = `
        <div class="calendar-header">
            <button id="prev-month" type="button">&lt;</button>
            <span>${monthName} ${year}</span>
            <button id="next-month" type="button">&gt;</button>
        </div>
        <div class="calendar-grid">
            <div class="calendar-weekday">Su</div><div class="calendar-weekday">Mo</div>
            <div class="calendar-weekday">Tu</div><div class="calendar-weekday">We</div>
            <div class="calendar-weekday">Th</div><div class="calendar-weekday">Fr</div>
            <div class="calendar-weekday">Sa</div>
    `;

    for (let i = 0; i < firstDay; i++) html += '<div class="calendar-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const hasFlight = appData.flightDates.includes(dateStr);
        const isSelected = appData.selectedDate === dateStr;
        html += `<div class="calendar-day ${hasFlight ? 'has-flight' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">${d}</div>`;
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelector('#prev-month').onclick = (e) => {
        e.stopPropagation();
        date.setMonth(date.getMonth() - 1);
        renderCalendar(date, container, input);
    };
    container.querySelector('#next-month').onclick = (e) => {
        e.stopPropagation();
        date.setMonth(date.getMonth() + 1);
        renderCalendar(date, container, input);
    };
    container.querySelectorAll('.calendar-day:not(.empty)').forEach(day => {
        day.onclick = (e) => {
            e.stopPropagation();
            appData.selectedDate = day.dataset.date;
            input.value = appData.selectedDate;
            container.style.display = 'none';
        };
    });
}

async function performSearch(dep, arr, date) {
    if (!dep || !arr || !date) {
        alert("Please select departure, destination, and date.");
        return;
    }
    const resultsSection = document.getElementById('flight-results');
    const container = document.getElementById('flights-container');

    if (!dbClient) {
        container.innerHTML = '<p style="text-align:center;">Database connection unavailable. Please try again later.</p>';
        return;
    }

    resultsSection.style.display = 'block';
    container.innerHTML = '<div class="loading-spinner" style="text-align:center; padding: 40px;">Searching for available flights...</div>';
    window.scrollTo({ top: resultsSection.offsetTop - 100, behavior: 'smooth' });

    try {
        const { data, error } = await dbClient
            .from('flights')
            .select('*')
            .eq('departure_airport', dep)
            .eq('destination_airport', arr);

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding: 40px;">No flights found for this route.</p>';
            return;
        }

        // Filter by date strictly
        const filtered = data.filter(f => {
            if (!f.event_start) return false;
            return new Date(f.event_start).toISOString().split('T')[0] === date;
        });

        if (filtered.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding: 40px;">No flights found for the selected date.</p>';
            return;
        }
        renderFlightResults(filtered, container);
    } catch (err) {
        console.error("Search failed:", err.message);
        container.innerHTML = `<p style="text-align:center; padding: 40px;">Error loading flights: ${err.message}</p>`;
    }
}

function renderFlightResults(flights, container) {
    container.innerHTML = flights.map(flight => {
        const start = new Date(flight.event_start);
        const end = new Date(flight.event_end);
        const durationMs = end - start;
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const localStartTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const localEndTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let codeshareInfo = flight.is_codeshare ?
            `Operated by <a href="${flight.codeshare_discord_link}" target="_blank" class="codeshare-link">${flight.codeshare_airline}</a>` :
            "Operated by Doncor Wings";

        return `
            <div class="flight-card" id="flight-${flight.flight_number}">
                <div class="flight-main">
                    <div class="flight-route">
                        <div class="route-point"><div class="route-time">${localStartTime}</div><div class="route-airport">${flight.departure_airport}</div></div>
                        <div class="route-arrow"></div>
                        <div class="route-point"><div class="route-time">${localEndTime}</div><div class="route-airport">${flight.destination_airport}</div></div>
                    </div>
                    <div class="flight-duration">Total duration: ${hours}h ${minutes}m</div>
                    <div class="flight-details">
                        <div class="detail-item"><strong>Aircraft</strong>${flight.aircraft_type}</div>
                        <div class="detail-item"><strong>Flight No.</strong>${flight.flight_number}</div>
                        <div class="detail-item"><strong>Carrier</strong>${codeshareInfo}</div>
                    </div>
                    <div class="legal-disclaimer-small">Doncor Wings PTFS is a fictional roleplay community for Roblox. This is a virtual flight; no real-world tickets or monetary transactions are involved.</div>
                </div>
                <div class="booking-options">${renderBookingPanel(flight)}</div>
            </div>
        `;
    }).join('');
}

function renderBookingPanel(flight) {
    if (!currentUserState.id) {
        return `
            <div class="login-to-book">
                <p>Login via Discord to Book</p>
                <button class="btn btn-primary btn-sm" onclick="signInWithDiscord()">Sign In</button>
            </div>
        `;
    }
    const { tier, vouchers } = currentUserState;

    const busDisabled = !(tier.includes("Silver") || tier.includes("Gold") || (tier.includes("Bronze") && vouchers.business > 0));
    const firstDisabled = !(tier.includes("Gold") || (tier.includes("Silver") && vouchers.first > 0));

    const busStatus = tier.includes("Silver") || tier.includes("Gold") ? "Included" : (tier.includes("Bronze") && vouchers.business > 0 ? `Use Voucher (${vouchers.business})` : "Tier Locked");
    const firstStatus = tier.includes("Gold") ? "Included" : (tier.includes("Silver") && vouchers.first > 0 ? `Use Voucher (${vouchers.first})` : "Tier Locked");

    return `
        <div class="booking-block">
            <div class="block-info"><h4>Economy</h4><p>Standard Virtual Seat</p></div>
            <button class="btn btn-primary btn-sm" onclick="bookFlight('${flight.flight_number}', 'Economy', false)">Book Now</button>
        </div>
        <div class="booking-block ${busDisabled ? 'locked' : ''}">
            <div class="block-info"><h4>Business Class</h4><p>${busStatus}</p></div>
            ${!busDisabled ? `<button class="btn btn-outline btn-sm" onclick="bookFlight('${flight.flight_number}', 'Business', ${tier.includes('Bronze')})">Book Seat</button>` : ''}
        </div>
        <div class="booking-block ${firstDisabled ? 'locked' : ''}">
            <div class="block-info"><h4>First Class</h4><p>${firstStatus}</p></div>
            ${!firstDisabled ? `<button class="btn btn-outline btn-sm" onclick="bookFlight('${flight.flight_number}', 'First', ${tier.includes('Silver')})">Book Seat</button>` : ''}
        </div>
    `;
}

async function bookFlight(flightNumber, bookingClass, useVoucher) {
    if (!dbClient || !currentUserState.id) return;
    try {
        const { error } = await dbClient.from('bookings').insert([{
            flight_number: flightNumber,
            user_id: currentUserState.id,
            discord_id: currentUserState.discord_id,
            username: currentUserState.username,
            booking_class: bookingClass,
            used_voucher: useVoucher,
            checked_in: false,
            miles_claimed: false
        }]);
        if (error) throw error;

        if (useVoucher) {
            const field = bookingClass === 'Business' ? 'business_vouchers' : 'first_vouchers';
            const val = (bookingClass === 'Business' ? currentUserState.vouchers.business : currentUserState.vouchers.first) - 1;
            await dbClient.from('profiles').update({ [field]: val }).eq('id', currentUserState.id);
            if (bookingClass === 'Business') currentUserState.vouchers.business = val;
            else currentUserState.vouchers.first = val;
        }

        const card = document.getElementById(`flight-${flightNumber}`);
        if (card) {
            card.innerHTML = `
                <div class="success-card" style="grid-column: 1 / -1; width: 100%;">
                    <div class="success-icon">✓</div>
                    <h2>Booking Successful!</h2>
                    <p>A confirmation has been sent to your Discord DMs. Your ${bookingClass} seat is confirmed.</p>
                    <button class="btn btn-outline btn-sm" style="margin-top: 20px;" onclick="location.reload()">Back to Search</button>
                </div>
            `;
        }
    } catch (err) {
        console.error("Booking failed:", err.message);
        alert("Booking failed: " + err.message);
    }
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
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    });
}

// --- Auth UI & Dropdown ---
function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');
    if (userProfile && loginBtn) {
        loginBtn.style.display = 'none';
        userProfile.style.display = 'flex';

        const nameEl = userProfile.querySelector('#user-name');
        const statsEl = userProfile.querySelector('#user-stats');
        const avatarEl = userProfile.querySelector('img');

        if (nameEl) nameEl.innerText = currentUserState.username;
        if (statsEl) statsEl.innerText = `Tier: ${currentUserState.tier} | ${currentUserState.miles.toLocaleString()} Miles`;
        if (avatarEl && currentUserState.avatar) avatarEl.src = currentUserState.avatar;

        userProfile.classList.remove('status-silver', 'status-gold', 'status-bronze');
        const tierLower = currentUserState.tier.toLowerCase();
        if (tierLower.includes('silver')) userProfile.classList.add('status-silver');
        else if (tierLower.includes('gold')) userProfile.classList.add('status-gold');
        else if (tierLower.includes('bronze')) userProfile.classList.add('status-bronze');
        setupUserDropdown(userProfile);
    }
}

function setupUserDropdown(profileElement) {
    const newEl = profileElement.cloneNode(true);
    profileElement.parentNode.replaceChild(newEl, profileElement);
    newEl.onclick = (e) => {
        e.stopPropagation();
        const existing = document.getElementById('user-dropdown');
        if (existing) existing.remove();
        else renderDropdown(newEl);
    };
}

function renderDropdown(parent) {
    const dropdown = document.createElement('div');
    dropdown.id = 'user-dropdown';
    dropdown.className = 'user-dropdown-menu';
    dropdown.innerHTML = `
        <div class="dropdown-header"><span class="user-name-large">${currentUserState.username}</span><span class="user-tier-badge">${currentUserState.tier}</span></div>
        <div class="dropdown-divider"></div>
        <div class="dropdown-info">
            <div class="info-item"><span class="label">Current Balance</span><span class="value">${currentUserState.miles.toLocaleString()} Miles</span></div>
            <div class="info-item" style="margin-top:10px;"><span class="label">Vouchers</span><span class="value">B: ${currentUserState.vouchers.business} | F: ${currentUserState.vouchers.first}</span></div>
        </div>
        <div class="dropdown-divider"></div>
        <button id="logout-link" class="dropdown-item logout-btn">Logout</button>
    `;
    parent.appendChild(dropdown);
    dropdown.querySelector('#logout-link').onclick = (e) => { e.preventDefault(); handleLogout(); };
    setTimeout(() => {
        const close = (e) => { if (!dropdown.contains(e.target) && !parent.contains(e.target)) { dropdown.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 10);
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();

    // Run async checks
    await checkUserSession();
    await fetchActiveFlightData();

    initBookingMask();

    // Global Login Listeners (Excluding header button which is handled by updateAuthUI if needed, but the original logic attached it to all)
    const loginBtns = document.querySelectorAll('#login-btn, .btn-primary');
    loginBtns.forEach(btn => {
        if (btn.id === 'search-flights-btn') return; // Skip search button
        btn.addEventListener('click', (e) => {
            const text = btn.innerText.toLowerCase();
            if (text.includes('discord') || btn.id === 'login-btn' || text.includes('sign in')) {
                if (btn.getAttribute('href') === '#' || !btn.getAttribute('href') || btn.tagName === 'BUTTON') {
                    e.preventDefault();
                    signInWithDiscord();
                }
            }
        });
    });

    // Stats Animation Intersection Observer
    const statsGrid = document.querySelector('.stats-grid') || document.querySelector('.tiers-grid');
    if (statsGrid) {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                animateStats();
                observer.disconnect();
            }
        });
        observer.observe(statsGrid);
    }

    // Mobile Menu
    const toggle = document.getElementById('mobile-toggle');
    const nav = document.getElementById('nav-menu');
    if (toggle && nav) {
        toggle.onclick = () => { toggle.classList.toggle('active'); nav.classList.toggle('active'); };
        nav.querySelectorAll('a').forEach(l => l.onclick = () => { toggle.classList.remove('active'); nav.classList.remove('active'); });
    }

    // Smooth Scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.onclick = function(e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
            const target = document.querySelector(href);
            if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
        };
    });
});

// Expose globally
window.signInWithDiscord = signInWithDiscord;
window.bookFlight = bookFlight;
