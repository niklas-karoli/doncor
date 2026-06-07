/**
 * DONCOR WINGS PTFS - Main Logic
 * Professional Booking Hub Edition - v2.2 Production Robust
 */

const supabaseUrl = 'https://cqybjgwbehmjpeecqkbq.supabase.co';
const supabaseKey = 'sb_publishable_8jrQCtGf-KaQR1s7avn4ew_RJcuBSfz';
let dbClient = null;

let currentUserState = {
    id: null,
    discord_id: '',
    username: '',
    tier: 'White Wing',
    miles: 0,
    avatar: '',
    vouchers: { business: 0, first: 0 },
    bookings: []
};

let appData = {
    activeFlights: [],
    departureAirports: [],
    arrivalAirports: [],
    flightDates: [],
    selectedDate: null,
    isDataLoaded: false
};

function initSupabase() {
    try {
        if (typeof supabase !== 'undefined') {
            dbClient = supabase.createClient(supabaseUrl, supabaseKey);
        }
    } catch (e) { console.error("Supabase failed:", e.message); }
}

function calculateTier(miles) {
    const m = parseInt(miles) || 0;
    if (m >= 72000) return "Gold Captain (Elite)";
    if (m >= 36000) return "Silver Commander";
    if (m >= 12000) return "Bronze Aviator";
    return "White Wing";
}

function getLocalDateStr(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Auth & Profile ---
async function signInWithDiscord() {
    if (!dbClient) return;
    await dbClient.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: window.location.origin + '/discord/' }
    });
}

async function handleLogout() {
    if (!dbClient) return;
    await dbClient.auth.signOut();
    window.location.reload();
}

async function checkUserSession() {
    if (!dbClient) return;
    try {
        const { data: { session } } = await dbClient.auth.getSession();
        if (session) {
            const user = session.user;
            const meta = user.user_metadata || {};
            const discordName = meta.full_name || meta.global_name || meta.user_name || "Virtual Pilot";
            const discordId = meta.provider_id || user.id;

            const { data: profile } = await dbClient.from('profiles').select('*').eq('id', user.id).single();

            const miles = profile?.mileage_points || 0;
            currentUserState = {
                id: user.id,
                discord_id: discordId,
                username: discordName,
                tier: calculateTier(miles),
                miles: miles,
                avatar: meta.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(discordName)}`,
                vouchers: {
                    business: profile?.business_vouchers || 0,
                    first: profile?.first_vouchers || 0
                },
                bookings: []
            };
            await fetchUserBookings();
            updateAuthUI();
        }
    } catch (err) { console.error("Session failed:", err.message); }
}

async function fetchUserBookings() {
    if (!dbClient || !currentUserState.id) return;
    try {
        const { data, error } = await dbClient
            .from('bookings')
            .select('*, flights(*)')
            .eq('user_id', currentUserState.id);
        if (!error && data) currentUserState.bookings = data;
    } catch (e) { console.error("Bookings fetch failed:", e.message); }
}

// --- Flight Data ---
async function fetchActiveFlightData() {
    if (!dbClient) return;
    try {
        const { data, error } = await dbClient
            .from('flights')
            .select('departure_airport, destination_airport, event_start');

        if (error || !data) return;

        appData.activeFlights = data;
        appData.departureAirports = [...new Set(data.map(f => f.departure_airport).filter(Boolean))].sort();
        appData.flightDates = [...new Set(data.map(f => getLocalDateStr(f.event_start)).filter(Boolean))];
        appData.isDataLoaded = true;
    } catch (err) { console.error("Data fetch failed:", err.message); }
}

function initBookingMask() {
    try {
        const depInput = document.getElementById('departure-input');
        const arrInput = document.getElementById('arrival-input');
        const dateInput = document.getElementById('date-input');
        const searchBtn = document.getElementById('search-flights-btn');

        if (depInput) setupAutocomplete(depInput, 'departure-list', true);
        if (arrInput) setupAutocomplete(arrInput, 'arrival-list', false);
        if (dateInput) setupCalendar(dateInput);

        if (searchBtn) {
            searchBtn.onclick = (e) => {
                e.preventDefault();
                const dep = depInput?.value || "";
                const arr = arrInput?.value || "";
                performSearch(dep, arr, appData.selectedDate);
            };
        }
    } catch (e) { console.error("Booking Mask Init Error:", e.message); }
}

function setupAutocomplete(input, listId, isDeparture) {
    const list = document.getElementById(listId);
    if (!list) return;

    const trigger = () => renderSmartAutocomplete(input, list, isDeparture);
    input.addEventListener('focus', trigger);
    input.addEventListener('input', trigger);
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !list.contains(e.target)) list.style.display = 'none';
    });
}

function renderSmartAutocomplete(input, list, isDeparture) {
    list.innerHTML = '';
    if (!appData.isDataLoaded) {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.textContent = 'Synchronizing...';
        list.appendChild(item);
        list.style.display = 'block';
        return;
    }

    let options = [];
    if (isDeparture) {
        options = appData.departureAirports;
    } else {
        const depVal = document.getElementById('departure-input')?.value || "";
        options = [...new Set(appData.activeFlights.filter(f => f.departure_airport === depVal).map(f => f.destination_airport).filter(Boolean))];
    }

    const query = input.value.toLowerCase();
    const filtered = options.filter(o => o.toLowerCase().includes(query)).sort();

    if (filtered.length > 0) {
        filtered.forEach(o => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = o;
            item.onclick = () => {
                input.value = o;
                list.style.display = 'none';
                if (isDeparture) {
                    const arr = document.getElementById('arrival-input');
                    if (arr) arr.value = '';
                }
            };
            list.appendChild(item);
        });
    } else {
        const item = document.createElement('div');
        item.className = 'autocomplete-item empty-state';
        item.textContent = isDeparture ? "No scheduled departures" : "No available destinations";
        list.appendChild(item);
    }
    list.style.display = 'block';
}

function setupCalendar(input) {
    const picker = document.getElementById('calendar-picker');
    if (!picker) return;

    let currentMonth = new Date();
    input.onclick = (e) => {
        e.stopPropagation();
        picker.style.display = picker.style.display === 'block' ? 'none' : 'block';
        renderCalendar(currentMonth, picker, input);
    };
}

function renderCalendar(date, container, input) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'calendar-header';
    header.innerHTML = `<button type="button" id="prev-m">&lt;</button><span>${date.toLocaleString('en', {month:'long'})} ${year}</span><button type="button" id="next-m">&gt;</button>`;
    container.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(d => {
        const div = document.createElement('div');
        div.className = 'calendar-weekday';
        div.textContent = d;
        grid.appendChild(div);
    });

    for(let i=0; i<firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'calendar-day empty';
        grid.appendChild(div);
    }

    for(let d=1; d<=daysInMonth; d++) {
        const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const div = document.createElement('div');
        const hasFlight = appData.flightDates.includes(ds);
        const isSelected = appData.selectedDate === ds;

        div.className = 'calendar-day';
        if (hasFlight) div.classList.add('has-flight');
        if (isSelected) div.classList.add('selected');

        div.dataset.date = ds;
        const span = document.createElement('span');
        span.textContent = d;
        div.appendChild(span);
        div.onclick = () => {
            appData.selectedDate = ds;
            input.value = ds;
            container.style.display = 'none';
        };
        grid.appendChild(div);
    }
    container.appendChild(grid);

    container.querySelector('#prev-m').onclick = (e) => { e.stopPropagation(); date.setMonth(month-1); renderCalendar(date, container, input); };
    container.querySelector('#next-m').onclick = (e) => { e.stopPropagation(); date.setMonth(month+1); renderCalendar(date, container, input); };
}

// --- Search & Display ---
async function performSearch(dep, arr, date) {
    if (!dep || !arr || !date) return alert("Please complete the booking form.");
    const container = document.getElementById('flights-container');
    if (!container) return;

    const resultsSection = document.getElementById('flight-results');
    if (resultsSection) resultsSection.style.display = 'block';

    container.innerHTML = '<div style="text-align:center; padding:40px;">Searching premium connections...</div>';

    try {
        const { data } = await dbClient.from('flights').select('*').eq('departure_airport', dep).eq('destination_airport', arr);
        const filtered = (data || []).filter(f => getLocalDateStr(f.event_start) === date);

        if (filtered.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:40px;">No flights found for this route and date.</p>';
            return;
        }
        renderFlightResults(filtered, container);
    } catch (e) { container.innerHTML = '<p>Search error.</p>'; }
}

function renderFlightResults(flights, container) {
    container.innerHTML = '';
    flights.forEach(f => {
        const card = document.createElement('div');
        card.className = 'flight-card';
        card.id = `flight-${f.flight_number}`;

        const newDepTime = new Date(f.event_start);
        const originalArrTime = new Date(f.event_end);

        let displayDepTime = newDepTime;
        let displayArrTime = originalArrTime;
        let origDepStr = '', origArrStr = '';

        const isDel = f.is_delayed && f.original_start;
        if (isDel) {
            const origDep = new Date(f.original_start);
            const offset = newDepTime.getTime() - origDep.getTime();
            displayArrTime = new Date(originalArrTime.getTime() + offset);

            origDepStr = origDep.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            origArrStr = originalArrTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        }

        const depStr = displayDepTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        const arrStr = displayArrTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

        const main = document.createElement('div');
        main.className = 'flight-main';

        const route = document.createElement('div');
        route.className = 'flight-route';

        const createPoint = (time, airport, isDelayed, origTime) => {
            const pt = document.createElement('div');
            pt.className = 'route-point';
            const tDiv = document.createElement('div');
            tDiv.className = 'route-time';
            if (isDelayed) {
                const s1 = document.createElement('span'); s1.className = 'delayed-orig'; s1.textContent = origTime;
                const s2 = document.createElement('span'); s2.className = 'delayed-new'; s2.textContent = time;
                tDiv.appendChild(s1); tDiv.appendChild(document.createTextNode(' ')); tDiv.appendChild(s2);
            } else {
                tDiv.textContent = time;
            }
            const aDiv = document.createElement('div'); aDiv.className = 'route-airport'; aDiv.textContent = airport;
            pt.appendChild(tDiv); pt.appendChild(aDiv);
            return pt;
        };

        route.appendChild(createPoint(depStr, f.departure_airport, isDel, origDepStr));
        const arrow = document.createElement('div'); arrow.className = 'route-arrow'; route.appendChild(arrow);
        route.appendChild(createPoint(arrStr, f.destination_airport, isDel, origArrStr));
        main.appendChild(route);

        const dur = Math.floor((displayArrTime - displayDepTime)/60000);
        const durDiv = document.createElement('div'); durDiv.className = 'flight-duration';
        durDiv.textContent = `Duration: ${Math.floor(dur/60)}h ${dur%60}m`;
        main.appendChild(durDiv);

        const details = document.createElement('div'); details.className = 'flight-details';
        const createDetail = (label, value, isLink, linkUrl) => {
            const d = document.createElement('div'); d.className = 'detail-item';
            const s = document.createElement('strong'); s.textContent = label; d.appendChild(s);
            if (isLink) {
                const a = document.createElement('a'); a.href = linkUrl; a.target = '_blank';
                a.rel = 'noopener noreferrer'; a.className = 'codeshare-link'; a.textContent = value;
                d.appendChild(a);
            } else {
                d.appendChild(document.createTextNode(value));
            }
            return d;
        };
        details.appendChild(createDetail('Aircraft', f.aircraft_type || "TBD"));
        const carrierVal = f.is_codeshare ? `Operated by ${f.codeshare_airline}` : 'Doncor Wings';
        details.appendChild(createDetail('Carrier', carrierVal, f.is_codeshare, f.codeshare_discord_link));
        main.appendChild(details);

        const legal = document.createElement('div'); legal.className = 'legal-disclaimer-small';
        legal.textContent = 'Doncor Wings PTFS is a fictional roleplay community for Roblox. This is a virtual flight; no real-world tickets or monetary transactions are involved.';
        main.appendChild(legal);
        card.appendChild(main);

        const opts = document.createElement('div');
        opts.className = 'booking-options';
        const classes = f.available_classes || ['Economy'];
        ['Economy', 'Business', 'First'].forEach(cls => {
            if (classes.includes(cls)) opts.appendChild(renderBlock(f, cls));
        });
        card.appendChild(opts);
        container.appendChild(card);
    });
}

function renderBlock(f, cls) {
    const block = document.createElement('div');
    block.className = 'booking-block';
    if (!currentUserState.id) {
        const btn = document.createElement('button'); btn.className = 'btn btn-primary btn-sm'; btn.textContent = 'Sign In to Book';
        btn.onclick = signInWithDiscord;
        block.appendChild(btn);
        return block;
    }

    const { tier, vouchers } = currentUserState;
    const isLocked = (cls === 'Business' && !(tier.includes('Silver') || tier.includes('Gold') || (tier.includes('Bronze') && vouchers.business > 0))) ||
                     (cls === 'First' && !(tier.includes('Gold') || (tier.includes('Silver') && vouchers.first > 0)));

    if (isLocked) block.classList.add('locked');
    const bInfo = document.createElement('div'); bInfo.className = 'block-info';
    const h4 = document.createElement('h4'); h4.textContent = cls; bInfo.appendChild(h4);
    const p = document.createElement('p'); p.textContent = cls === 'Economy' ? 'Standard Seat' : (isLocked ? 'Tier Locked' : 'Available');
    bInfo.appendChild(p); block.appendChild(bInfo);

    if (!isLocked) {
        const btn = document.createElement('button'); btn.className = 'btn btn-primary btn-sm'; btn.textContent = 'Book';
        const useVoucher = (cls === 'Business' && tier.includes('Bronze')) || (cls === 'First' && tier.includes('Silver'));
        btn.onclick = () => bookFlight(f.flight_number, cls, useVoucher);
        block.appendChild(btn);
    }
    return block;
}

async function bookFlight(fn, cls, v) {
    try {
        const { error } = await dbClient.from('bookings').insert([{
            flight_number: fn, user_id: currentUserState.id, discord_id: currentUserState.discord_id,
            username: currentUserState.username, booking_class: cls, used_voucher: v
        }]);
        if (error) throw error;

        if (v) {
            const field = cls === 'Business' ? 'business_vouchers' : 'first_vouchers';
            const newVal = (currentUserState.vouchers[cls.toLowerCase()] || 1) - 1;
            await dbClient.from('profiles').update({ [field]: newVal }).eq('id', currentUserState.id);
            currentUserState.vouchers[cls.toLowerCase()] = newVal;
        }

        const card = document.getElementById(`flight-${fn}`);
        if (card) {
            card.innerHTML = '';
            const success = document.createElement('div'); success.className = 'success-card';
            const h2 = document.createElement('h2'); h2.textContent = 'Booking Successful!'; success.appendChild(h2);
            const p = document.createElement('p'); p.textContent = `A confirmation has been sent to your Discord DMs. Your ${cls} seat is locked in.`;
            success.appendChild(p); card.appendChild(success);
        }

        await fetchUserBookings();
        updateAuthUI();
    } catch (e) { alert("Booking error."); }
}

async function cancelBooking(id) {
    if (!confirm("Cancel this flight?")) return;
    try {
        const { error } = await dbClient.from('bookings').delete().eq('id', id);
        if (!error) {
            await fetchUserBookings();
            updateAuthUI();
        }
    } catch (e) { console.error("Cancel failed."); }
}

// --- UI Logic ---
function updateAuthUI() {
    const userProfile = document.getElementById('user-profile');
    const loginBtn = document.getElementById('login-btn');
    if (userProfile && currentUserState.id) {
        if (loginBtn) loginBtn.style.display = 'none';
        userProfile.style.display = 'flex';

        const nameEl = userProfile.querySelector('#user-name');
        const statsEl = userProfile.querySelector('#user-stats');
        const avatarEl = userProfile.querySelector('img');

        if (nameEl) nameEl.textContent = currentUserState.username;
        if (statsEl) statsEl.textContent = `${currentUserState.tier} | ${currentUserState.miles.toLocaleString()} Miles`;
        if (avatarEl) avatarEl.src = currentUserState.avatar;

        setupUserDropdown(userProfile);
    }
}

function setupUserDropdown(el) {
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    newEl.onclick = (e) => {
        e.stopPropagation();
        const existing = document.getElementById('user-dropdown');
        if (existing) existing.remove();
        else renderProfileDropdown(newEl);
    };
}

function renderProfileDropdown(parent) {
    const dropdown = document.createElement('div');
    dropdown.id = 'user-dropdown';
    dropdown.className = 'user-dropdown-menu';

    const dHeader = document.createElement('div'); dHeader.className = 'dropdown-header';
    const strong = document.createElement('strong'); strong.textContent = currentUserState.username; dHeader.appendChild(strong);
    dHeader.appendChild(document.createElement('br'));
    const small = document.createElement('small'); small.textContent = currentUserState.tier; dHeader.appendChild(small);
    dropdown.appendChild(dHeader);

    const div1 = document.createElement('div'); div1.className = 'dropdown-divider'; dropdown.appendChild(div1);

    const dInfo = document.createElement('div'); dInfo.className = 'dropdown-info';
    const s2 = document.createElement('strong'); s2.textContent = 'My Bookings'; dInfo.appendChild(s2);
    const list = document.createElement('div'); list.className = 'bookings-list-mini';

    if (currentUserState.bookings && currentUserState.bookings.length) {
        currentUserState.bookings.forEach(b => {
            if (!b.flights) return;
            const item = document.createElement('div'); item.className = 'booking-item-mini';
            const txt = document.createElement('div');
            const routeS = document.createElement('strong'); routeS.textContent = `${b.flights.departure_airport} ➔ ${b.flights.destination_airport}`;
            txt.appendChild(routeS); txt.appendChild(document.createElement('br'));
            const clsS = document.createElement('small'); clsS.textContent = b.booking_class; txt.appendChild(clsS);
            item.appendChild(txt);

            const btn = document.createElement('button'); btn.className = 'cancel-link'; btn.textContent = 'Cancel';
            btn.onclick = (e) => { e.stopPropagation(); cancelBooking(b.id); };
            item.appendChild(btn);
            list.appendChild(item);
        });
    } else {
        const p = document.createElement('p'); p.className = 'empty-state'; p.textContent = 'No active bookings';
        list.appendChild(p);
    }
    dInfo.appendChild(list); dropdown.appendChild(dInfo);

    const div2 = document.createElement('div'); div2.className = 'dropdown-divider'; dropdown.appendChild(div2);

    const logout = document.createElement('button'); logout.className = 'dropdown-item logout-btn'; logout.textContent = 'Logout';
    logout.onclick = (e) => { e.stopPropagation(); handleLogout(); };
    dropdown.appendChild(logout);

    parent.appendChild(dropdown);

    const clickHandler = (e) => {
        if (!dropdown.contains(e.target) && !parent.contains(e.target)) {
            dropdown.remove();
            document.removeEventListener('click', clickHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', clickHandler), 10);
}

function initMobileMenu() {
    const toggle = document.getElementById('mobile-toggle');
    const menu = document.getElementById('nav-menu');
    if (toggle && menu) {
        toggle.onclick = () => {
            toggle.classList.toggle('active');
            menu.classList.toggle('active');
        };
        // Close on link click
        menu.querySelectorAll('a').forEach(link => {
            link.onclick = () => {
                toggle.classList.remove('active');
                menu.classList.remove('active');
            };
        });
    }
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        initSupabase();
        initMobileMenu();
        await checkUserSession();
        await fetchActiveFlightData();
        initBookingMask();

        const statsGrid = document.querySelector('.stats-grid') || document.querySelector('.tiers-grid');
        if (statsGrid) {
            new IntersectionObserver((entries, observer) => {
                if (entries[0].isIntersecting) {
                    document.querySelectorAll('.stat-number').forEach(s => {
                        const target = parseInt(s.dataset.target) || 0;
                        let count = 0;
                        const update = () => {
                            count += Math.ceil(target/50);
                            if (count < target) {
                                s.textContent = count.toLocaleString() + (s.dataset.suffix || '');
                                requestAnimationFrame(update);
                            } else {
                                s.textContent = target.toLocaleString() + (s.dataset.suffix || '');
                            }
                        };
                        update();
                    });
                    observer.disconnect();
                }
            }).observe(statsGrid);
        }
    } catch (e) { console.error("Initialization failed:", e.message); }
});

window.signInWithDiscord = signInWithDiscord;
window.bookFlight = bookFlight;
window.cancelBooking = cancelBooking;
window.handleLogout = handleLogout;
