/**
 * DONCOR WINGS PTFS - Main Logic
 * Professional Booking Hub Edition - v2.3 Final (Fixed & Cleaned)
 */

const supabaseUrl = 'https://cqybjgwbehmjpeecqkbq.supabase.co';
const supabaseKey = 'sb_publishable_8jrQCtGf-KaQR1s7avn4ew_RJcuBSfz';
let dbClient = null;

const PARTNER_AIRLINES = {
    "Scoot PTFS": "https://discord.gg/BkqQJuUN4f"
};

const LOGO_SVG_MINI = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:14px; height:14px; vertical-align:middle; margin-left:4px; display:inline-block;">
    <path d="M10 50 L40 20 L90 20 L50 50 L90 80 L40 80 Z" fill="#FFC800"/>
    <path d="M20 50 L45 35 L75 35 L50 50 L75 65 L45 65 Z" fill="#ffffff" opacity="0.8"/>
</svg>`;

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
    lastSearchResults: [],
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
    if (m >= 72000) return "Gold Captain";
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
    const { error } = await dbClient.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: window.location.origin }
    });
    if (error) console.error('Login error:', error.message);
}

async function handleLogout() {
    if (!dbClient) return;
    await dbClient.auth.signOut();
    // Local state reset handled by onAuthStateChange
}

function resetUserState() {
    currentUserState = {
        id: null,
        discord_id: '',
        username: '',
        tier: 'White Wing',
        miles: 0,
        avatar: '',
        vouchers: { business: 0, first: 0 },
        bookings: []
    };

    const userProfile = document.getElementById('user-profile');
    const loginBtn = document.getElementById('login-btn');
    if (userProfile) userProfile.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'inline-block';

    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.remove();
}

async function handleAuthStateChange(event, session) {
    if (session) {
        const user = session.user;
        const meta = user.user_metadata || {};
        const discordName = meta.full_name || meta.global_name || meta.user_name || "Virtual Pilot";
        const discordId = meta.provider_id || user.id;

        try {
            const { data: profile } = await dbClient
                .from('profiles')
                .select('mileage_points, business_vouchers, first_vouchers')
                .eq('id', user.id)
                .single();

            const miles = profile?.mileage_points || 0;
            const tier = calculateTier(miles);
            let bVouchers = profile?.business_vouchers || 0;
            let fVouchers = profile?.first_vouchers || 0;

            // Optimistic Persistence Layer
            // Clear storage on fresh login or explicit refresh to avoid stale overrides
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                const storedVouchers = sessionStorage.getItem('optimistic_vouchers');
                if (storedVouchers) {
                    const ov = JSON.parse(storedVouchers);
                    // Only use it if it matches the current user AND the database hasn't updated yet
                    // Logic: If we were expecting a change, and the DB still shows the old value
                    // However, to satisfy "overwritten by a fresh, verified Supabase fetch",
                    // we should be careful. The user wants the DB to be the source of truth on load.

                    // Let's implement the "database has caught up" logic more strictly
                    if (ov.user_id === user.id) {
                        // If DB already reflects or surpasses the optimistic state (for both directions)
                        // this is tricky because we don't know if it was a book or cancel.
                        // But usually, we only use this for the immediate redirect.

                        // We clear it if it matches exactly, or if it's a fresh login
                        if (bVouchers === ov.business && fVouchers === ov.first) {
                            sessionStorage.removeItem('optimistic_vouchers');
                        } else {
                            // If we just loaded the page and there's a mismatch,
                            // we might still be in the "3.5s delay" window or just after.
                            // But the user said: "Kill Stale Overrides: Ensure sessionStorage overrides are completely cleared
                            // and overwritten by a fresh, verified Supabase fetch upon a successful login or hard reload."

                            // So if event is INITIAL_SESSION or SIGNED_IN, we KILL it.
                            sessionStorage.removeItem('optimistic_vouchers');
                        }
                    }
                }
            }

            // Advanced Tier/Voucher UI State Logic:
            // Show if > 0 AND tier hasn't granted permanent access
            let displayBVouchers = (tier !== "Silver Commander" && tier !== "Gold Captain") ? bVouchers : 0;
            let displayFVouchers = (tier !== "Gold Captain") ? fVouchers : 0;

            currentUserState = {
                id: user.id,
                discord_id: discordId,
                username: discordName,
                tier: tier,
                miles: miles,
                avatar: meta.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(discordName)}`,
                vouchers: {
                    business: bVouchers,
                    first: fVouchers,
                    displayBusiness: displayBVouchers,
                    displayFirst: displayFVouchers
                },
                bookings: []
            };
            await fetchUserBookings();
            updateAuthUI();
        } catch (err) { console.error("Profile fetch failed:", err.message); }
    } else {
        resetUserState();
    }
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
            .select('departure_airport, destination_airport, event_start, original_start, event_end, is_delayed, aircraft_type, is_codeshare, codeshare_airline, codeshare_discord_link, available_classes, flight_number');

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

    const depVal = document.getElementById('departure-input')?.value || "";
    const arrVal = document.getElementById('arrival-input')?.value || "";

    // Strictly filter dates based on route if both fields are filled
    let filteredDates = appData.flightDates;
    if (depVal && arrVal) {
        filteredDates = [...new Set(appData.activeFlights
            .filter(f => f.departure_airport === depVal && f.destination_airport === arrVal)
            .map(f => getLocalDateStr(f.event_start))
            .filter(Boolean))];
    } else if (depVal || arrVal) {
        // According to directive: "strictly wait until both Departure and Arrival fields are filled out"
        // So we show no highlights if only one is filled? Or show all?
        // "If no route is selected yet, it can remain blank or show all"
        // Let's go with blank highlights if partially filled to be "strict".
        filteredDates = [];
    }

    for(let d=1; d<=daysInMonth; d++) {
        const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const div = document.createElement('div');
        const hasFlight = filteredDates.includes(ds);
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
            appData.lastSearchResults = [];
            container.innerHTML = '<p style="text-align:center; padding:40px;">No flights found for this route and date.</p>';
            return;
        }
        appData.lastSearchResults = filtered;
        renderFlightResults(filtered, container);
    } catch (e) { container.innerHTML = '<p>Search error.</p>'; }
}

function renderFlightResults(flights, container) {
    container.innerHTML = '';
    flights.forEach(f => {
        const card = document.createElement('div');
        card.className = 'flight-card';
        card.id = `flight-${f.flight_number}`;

        const eventDep = new Date(f.event_start);
        const eventArr = new Date(f.event_end);
        const durationMs = eventArr.getTime() - eventDep.getTime();

        let displayDepTime = eventDep;
        let displayArrTime = eventArr;
        let origDepStr = '', origArrStr = '';

        const isDel = f.is_delayed && f.original_start;
        if (isDel) {
            const origDep = new Date(f.original_start);
            const origArr = new Date(origDep.getTime() + durationMs);

            origDepStr = origDep.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            origArrStr = origArr.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
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

        const durMin = Math.floor(durationMs/60000);
        const durDiv = document.createElement('div'); durDiv.className = 'flight-duration';
        durDiv.textContent = `Duration: ${Math.floor(durMin/60)}h ${durMin%60}m`;
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
                const valSpan = document.createElement('span');
                valSpan.innerHTML = value; // Allowed for highlights
                d.appendChild(valSpan);
            }
            return d;
        };

        const highlightAircraft = (name) => {
            if (!name) return "TBD";
            return name.replace(/(\d+)/g, '<span class="highlight">$1</span>');
        };

        details.appendChild(createDetail('Aircraft', highlightAircraft(f.aircraft_type)));

        let carrierVal = 'Doncor Wings';
        let carrierLink = null;
        if (f.is_codeshare) {
            carrierVal = `Operated by ${f.codeshare_airline}`;
            carrierLink = PARTNER_AIRLINES[f.codeshare_airline] || f.codeshare_discord_link;
        }

        details.appendChild(createDetail('Carrier', carrierVal, !!carrierLink, carrierLink));
        main.appendChild(details);

        const legal = document.createElement('div'); legal.className = 'legal-disclaimer-small';
        legal.textContent = 'Doncor Wings PTFS is a fictional roleplay community for Roblox. This is a virtual flight; no real-world tickets or monetary transactions are involved.';
        main.appendChild(legal);
        card.appendChild(main);

        const hasAlreadyBooked = currentUserState.bookings.some(b => b.flight_number === f.flight_number);

        if (hasAlreadyBooked) {
            const alertBox = document.createElement('div');
            alertBox.className = 'already-booked-alert';
            const alertText = document.createElement('p');
            alertText.textContent = "You have already booked this flight. Multiple bookings for the same flight are not permitted on this account.";
            alertBox.appendChild(alertText);
            card.appendChild(alertBox);
        } else {
            const opts = document.createElement('div');
            opts.className = 'booking-options';
            const classes = f.available_classes || ['Economy'];
            ['Economy', 'Business', 'First'].forEach(cls => {
                if (classes.includes(cls)) opts.appendChild(renderBlock(f, cls));
            });
            card.appendChild(opts);
        }
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

    // Accessibility logic: Unlock if Tier permits OR if User has a voucher
    const tierPermitsBusiness = (tier === 'Silver Commander' || tier === 'Gold Captain');
    const tierPermitsFirst = (tier === 'Gold Captain');

    const hasBusinessVoucher = vouchers.business > 0;
    const hasFirstVoucher = vouchers.first > 0;

    const canBookBusiness = tierPermitsBusiness || hasBusinessVoucher;
    const canBookFirst = tierPermitsFirst || hasFirstVoucher;

    let isLocked = false;
    if (cls === 'Business' && !canBookBusiness) isLocked = true;
    if (cls === 'First' && !canBookFirst) isLocked = true;

    if (isLocked) block.classList.add('locked');
    const bInfo = document.createElement('div'); bInfo.className = 'block-info';
    const h4 = document.createElement('h4'); h4.textContent = cls; bInfo.appendChild(h4);

    const pText = cls === 'Economy' ? 'Standard Seat' : (isLocked ? 'Tier Locked' : 'Available');
    const p = document.createElement('p'); p.textContent = pText;
    bInfo.appendChild(p); block.appendChild(bInfo);

    if (!isLocked) {
        const useVoucher = (cls === 'Business' && !tierPermitsBusiness && hasBusinessVoucher) ||
                           (cls === 'First' && !tierPermitsFirst && hasFirstVoucher);
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = useVoucher ? 'Book with Voucher' : 'Book';
        btn.onclick = () => bookFlight(f.flight_number, cls, useVoucher);
        block.appendChild(btn);
    }
    return block;
}

async function bookFlight(fn, cls, v) {
    try {
        // Pre-validation: ensure voucher exists locally if required
        if (v) {
            const currentCount = currentUserState.vouchers[cls.toLowerCase()] || 0;
            if (currentCount <= 0) {
                alert(`You do not have any ${cls} vouchers remaining.`);
                return;
            }
        }

        // Show loading overlay
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';

        const { error } = await dbClient.from('bookings').insert([{
            flight_number: fn, user_id: currentUserState.id, discord_id: currentUserState.discord_id,
            username: currentUserState.username, booking_class: cls, used_voucher: v
        }]);

        if (error) {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            throw error;
        }

        // --- Optimistic UI Updates & DB Sync ---

        // 1. Update Voucher State, DB & Persistence
        if (v) {
            const key = cls.toLowerCase();
            const col = key === 'business' ? 'business_vouchers' : 'first_vouchers';
            currentUserState.vouchers[key] = Math.max(0, currentUserState.vouchers[key] - 1);

            // Execute database deduction via secure RPC
            const { error: syncError } = await dbClient.rpc('update_user_vouchers', {
                target_column: col,
                new_value: currentUserState.vouchers[key]
            });

            if (syncError) console.error("Voucher sync failed:", syncError.message);

            // Update display counts based on tier logic
            const { tier } = currentUserState;
            currentUserState.vouchers.displayBusiness = (tier !== "Silver Commander" && tier !== "Gold Captain") ? currentUserState.vouchers.business : 0;
            currentUserState.vouchers.displayFirst = (tier !== "Gold Captain") ? currentUserState.vouchers.first : 0;

            // Persist to sessionStorage to handle the redirect/re-fetch race condition
            sessionStorage.setItem('optimistic_vouchers', JSON.stringify({
                user_id: currentUserState.id,
                business: currentUserState.vouchers.business,
                first: currentUserState.vouchers.first
            }));
        }

        // 2. Mock the new booking in local state
        // This ensures the flight card swaps to "Already Booked" and the dropdown shows it
        const mockFlight = appData.lastSearchResults.find(f => f.flight_number === fn) || { departure_airport: 'TBD', destination_airport: 'TBD' };
        currentUserState.bookings.push({
            id: 'temp-' + Date.now(),
            flight_number: fn,
            user_id: currentUserState.id,
            booking_class: cls,
            used_voucher: v,
            flights: mockFlight
        });

        // 3. Immediate DOM Updates
        updateAuthUI(); // Updates the top bar

        // Re-render dropdown if it's currently open
        const dropdown = document.getElementById('user-dropdown');
        if (dropdown) {
            const userProfile = document.getElementById('user-profile');
            if (userProfile) {
                dropdown.remove();
                renderProfileDropdown(userProfile);
            }
        }

        // Re-render flight cards to show "Already Booked" and disabled voucher buttons
        const container = document.getElementById('flights-container');
        if (container && appData.lastSearchResults.length > 0) {
            renderFlightResults(appData.lastSearchResults, container);
        }

        // 4. Artificial Delay (3.5 seconds) for premium feel and text readability
        setTimeout(() => {
            window.location.replace('booking-success.html');
        }, 3500);

    } catch (e) {
        console.error("Booking error:", e.message);
        alert("Booking error.");
    }
}

function showCustomModal(title, message, onConfirm) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';

    const close = () => {
        modal.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
        onConfirm();
        close();
    };
    cancelBtn.onclick = close;
}

async function cancelBooking(id) {
    const booking = currentUserState.bookings.find(b => b.id === id);
    if (!booking) return;

    showCustomModal(
        "Cancel Booking",
        "Are you sure you want to cancel this booking? This action cannot be undone.",
        async () => {
            try {
                const { error } = await dbClient.from('bookings').delete().eq('id', id);
                if (!error) {
                    // Optimistic Voucher Increment & DB Sync
                    if (booking.used_voucher) {
                        const cls = booking.booking_class.toLowerCase();
                        const col = cls === 'business' ? 'business_vouchers' : 'first_vouchers';
                        if (cls === 'business' || cls === 'first') {
                            currentUserState.vouchers[cls]++;

                            // Execute database refund via secure RPC
                            const { error: syncError } = await dbClient.rpc('update_user_vouchers', {
                                target_column: col,
                                new_value: currentUserState.vouchers[cls]
                            });

                            if (syncError) console.error("Voucher refund failed:", syncError.message);

                            // Update display counts based on tier logic
                            const { tier } = currentUserState;
                            currentUserState.vouchers.displayBusiness = (tier !== "Silver Commander" && tier !== "Gold Captain") ? currentUserState.vouchers.business : 0;
                            currentUserState.vouchers.displayFirst = (tier !== "Gold Captain") ? currentUserState.vouchers.first : 0;

                            // Update persistence to avoid race condition on refresh
                            sessionStorage.setItem('optimistic_vouchers', JSON.stringify({
                                user_id: currentUserState.id,
                                business: currentUserState.vouchers.business,
                                first: currentUserState.vouchers.first
                            }));
                        }
                    }

                    // Update local state by removing the booking
                    currentUserState.bookings = currentUserState.bookings.filter(b => b.id !== id);

                    // Update UI immediately (dropdown/dashboard)
                    const dropdown = document.getElementById('user-dropdown');
                    if (dropdown) {
                        const items = dropdown.querySelectorAll('.booking-item-mini');
                        items.forEach(item => {
                            const btn = item.querySelector('.cancel-link');
                            if (btn && btn.getAttribute('data-id') === id.toString()) {
                                item.remove();
                            }
                        });

                        const list = dropdown.querySelector('.bookings-list-mini');
                        if (list && list.querySelectorAll('.booking-item-mini').length === 0) {
                            list.innerHTML = '<p class="empty-state">You have no active bookings</p>';
                        }
                    }

                    // Trigger UI update to refresh potential counters or states
                    updateAuthUI();
                } else {
                    console.error("Supabase delete error:", error);
                }
            } catch (e) { console.error("Cancel failed:", e.message); }
        }
    );
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
        if (statsEl) {
            statsEl.innerHTML = `${currentUserState.tier} | ${currentUserState.miles.toLocaleString()} ${LOGO_SVG_MINI}`;
        }
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

    // Voucher Display Logic: Show if user has displayable vouchers > 0
    const { vouchers } = currentUserState;
    if (vouchers.displayBusiness > 0 || vouchers.displayFirst > 0) {
        const divV = document.createElement('div'); divV.className = 'dropdown-divider'; dropdown.appendChild(divV);
        const dVouchers = document.createElement('div'); dVouchers.className = 'dropdown-info';

        if (vouchers.displayBusiness > 0) {
            const row = document.createElement('div'); row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center'; row.style.marginBottom = '5px';
            const vLabel = document.createElement('small'); vLabel.textContent = 'Business Vouchers';
            const vVal = document.createElement('div'); vVal.className = 'user-tier-badge'; vVal.textContent = vouchers.business;
            row.appendChild(vLabel); row.appendChild(vVal);
            dVouchers.appendChild(row);
        }
        if (vouchers.displayFirst > 0) {
            const row = document.createElement('div'); row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
            const vLabel = document.createElement('small'); vLabel.textContent = 'First Class Vouchers';
            const vVal = document.createElement('div'); vVal.className = 'user-tier-badge'; vVal.textContent = vouchers.first;
            row.appendChild(vLabel); row.appendChild(vVal);
            dVouchers.appendChild(row);
        }
        dropdown.appendChild(dVouchers);
    }

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

            const btn = document.createElement('button');
            btn.className = 'cancel-link';
            btn.textContent = 'Cancel';
            btn.setAttribute('data-id', b.id);
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

        // Login button listener
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await signInWithDiscord();
            });
        }

        if (dbClient) {
            dbClient.auth.onAuthStateChange((event, session) => {
                handleAuthStateChange(event, session);
            });
        }

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
