import { openDB, saveToStore, loadFromStore } from './data.js';
import { showToast } from './utils.js';


// Use global Papa from script in index.html
async function waitForPapaParse(maxRetries = 10, delayMs = 500) {
    for (let i = 0; i < maxRetries; i++) {
        if (window.Papa) {
            return window.Papa;
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new Error('PapaParse not loaded');
}

const POSITION_TYPE_MAPPINGS = {
    buy: ['buy', 'long', 'b', 'open buy', 'buy order', 'bull'],
    sell: ['sell', 'short', 's', 'open sell', 'sell order', 'bear'],
    inferred: ['win', 'loss']
};

// Column mappings for CSV files
const COLUMN_MAPPINGS = {
    entry_datetime: ['Open Time', 'Time', 'Entry Time', 'OpenTime', 'EntryTime', 'Date', 'Open'],
    position: ['Type', 'Position', 'Order Type', 'OrderType', 'Outcome'],
    lot: ['Lots', 'Volume', 'Size', 'Trade Size', 'TradeSize'],
    symbol: ['Symbol', 'Pair', 'Instrument', 'Ticker'],
    entry_price: ['Open Price', 'Price', 'Entry Price', 'OpenPrice', 'EntryPrice'],
    stop_loss: ['SL', 'Stop Loss', 'StopLoss', 'S / L', 'S/L', 'Risk'],
    take_profit: ['TP', 'Take Profit', 'TakeProfit', 'T / P', 'T/P'],
    exit_price: ['Close Price', 'Exit Price', 'ClosePrice', 'ExitPrice', 'Price'],
    commission: ['Commission', 'Fee', 'Commissions'],
    swap: ['Swap'],
    profit: ['Profit', 'PnL', 'P&L', 'Profit/Loss'],
    exit_datetime: ['Close Time', 'Exit Time', 'CloseTime', 'ExitTime', 'Close'],
    position_id: ['Ticket ID', 'Trade #', 'Order ID', 'Position ID', 'Trade ID', 'Ticket'],
    pips: ['Pips', 'Points', 'Pip']
};

// Update CTRADER_COLUMN_MAPPINGS at the top of import.js
const CTRADER_COLUMN_MAPPINGS = {
    entry_datetime: ['Opening time (UTC-4)', 'Open Time', 'Entry Time', 'Time (Open)', 'Start Time'],
    position: ['Opening direction', 'Trade Direction', 'Position Type', 'Direction', 'Type'],
    lot: ['Closing Quantity', 'Volume', 'Lots', 'Size', 'Trade Size', 'Quantity'],
    symbol: ['Symbol', 'Instrument', 'Pair', 'Market', 'Asset'],
    entry_price: ['Entry price', 'Open Price', 'Price (Open)', 'Entry', 'Start Price'],
    exit_price: ['Closing price', 'Close Price', 'Price (Close)', 'Exit', 'End Price'],
    commission: ['Commission', 'Fee', 'Broker Fee'],
    swap: ['Swap', 'Storage', 'Overnight Fee'],
    profit: ['Net USD', 'Profit', 'PnL', 'P&L', 'Profit/Loss', 'Net Profit'],
    exit_datetime: ['Closing time (UTC-4)', 'Close Time', 'Exit Time', 'Time (Close)', 'End Time'],
    position_id: ['Order ID', 'Position ID', 'Ticket', 'Trade ID']
};

// Add MT5_COLUMN_MAPPINGS after CTRADER_COLUMN_MAPPINGS
const MT5_COLUMN_MAPPINGS = {
    entry_datetime: ['Time', 'Open Time', 'Entry Time', 'Time (Entry)', 'Open'],
    position_id: ['Position ID', 'Order ID', 'Ticket', 'Position'],
    symbol: ['Symbol', 'Instrument', 'Pair', 'Market'],
    position: ['Type', 'Position', 'Order Type', 'Trade Type'],
    lot: ['Volume', 'Lots', 'Size', 'Trade Size', 'Quantity'],
    entry_price: ['Price', 'Open Price', 'Entry Price', 'Price (Entry)'],
    stop_loss: ['S / L', 'SL', 'Stop Loss', 'StopLoss'],
    take_profit: ['T / P', 'TP', 'Take Profit', 'TakeProfit'],
    exit_datetime: ['Close Time', 'Exit Time', 'Time (Exit)', 'Close'],
    exit_price: ['Close Price', 'Exit Price', 'Price (Exit)'],
    commission: ['Commission', 'Fee'],
    swap: ['Swap', 'Storage'],
    profit: ['Profit', 'PnL', 'P&L', 'Profit/Loss']
};


const COMMON_TIMEZONES = [
    // Africa
    "Africa/Abidjan", "Africa/Accra", "Africa/Addis_Ababa", "Africa/Algiers", "Africa/Asmara", "Africa/Bamako",
    "Africa/Bangui", "Africa/Banjul", "Africa/Bissau", "Africa/Blantyre", "Africa/Brazzaville", "Africa/Bujumbura",
    "Africa/Cairo", "Africa/Casablanca", "Africa/Ceuta", "Africa/Conakry", "Africa/Dakar", "Africa/Dar_es_Salaam",
    "Africa/Djibouti", "Africa/Douala", "Africa/El_Aaiun", "Africa/Freetown", "Africa/Gaborone", "Africa/Harare",
    "Africa/Johannesburg", "Africa/Juba", "Africa/Kampala", "Africa/Khartoum", "Africa/Kigali", "Africa/Kinshasa",
    "Africa/Lagos", "Africa/Libreville", "Africa/Lome", "Africa/Luanda", "Africa/Lubumbashi", "Africa/Lusaka",
    "Africa/Malabo", "Africa/Maputo", "Africa/Maseru", "Africa/Mbabane", "Africa/Mogadishu", "Africa/Monrovia",
    "Africa/Nairobi", "Africa/Ndjamena", "Africa/Niamey", "Africa/Nouakchott", "Africa/Ouagadougou",
    "Africa/Porto-Novo", "Africa/Sao_Tome", "Africa/Tripoli", "Africa/Tunis", "Africa/Windhoek",
    // America
    "America/Adak", "America/Anchorage", "America/Anguilla", "America/Antigua", "America/Araguaina",
    "America/Argentina/Buenos_Aires", "America/Argentina/Catamarca", "America/Argentina/Cordoba",
    "America/Argentina/Jujuy", "America/Argentina/La_Rioja", "America/Argentina/Mendoza",
    "America/Argentina/Rio_Gallegos", "America/Argentina/Salta", "America/Argentina/San_Juan",
    "America/Argentina/San_Luis", "America/Argentina/Tucuman", "America/Argentina/Ushuaia", "America/Aruba",
    "America/Asuncion", "America/Atikokan", "America/Bahia", "America/Bahia_Banderas", "America/Barbados",
    "America/Belem", "America/Belize", "America/Blanc-Sablon", "America/Boa_Vista", "America/Bogota",
    "America/Boise", "America/Cambridge_Bay", "America/Campo_Grande", "America/Cancun", "America/Caracas",
    "America/Cayenne", "America/Cayman", "America/Chicago", "America/Chihuahua", "America/Ciudad_Juarez",
    "America/Costa_Rica", "America/Creston", "America/Cuiaba", "America/Curacao", "America/Danmarkshavn",
    "America/Dawson", "America/Dawson_Creek", "America/Denver", "America/Detroit", "America/Dominica",
    "America/Edmonton", "America/Eirunepe", "America/El_Salvador", "America/Fort_Nelson", "America/Fortaleza",
    "America/Glace_Bay", "America/Goose_Bay", "America/Grand_Turk", "America/Grenada", "America/Guadeloupe",
    "America/Guatemala", "America/Guayaquil", "America/Guyana", "America/Halifax", "America/Havana",
    "America/Hermosillo", "America/Indiana/Indianapolis", "America/Indiana/Knox", "America/Indiana/Marengo",
    "America/Indiana/Petersburg", "America/Indiana/Tell_City", "America/Indiana/Vevay", "America/Indiana/Vincennes",
    "America/Indiana/Winamac", "America/Inuvik", "America/Iqaluit", "America/Jamaica", "America/Juneau",
    "America/Kentucky/Louisville", "America/Kentucky/Monticello", "America/Kralendijk", "America/La_Paz",
    "America/Lima", "America/Los_Angeles", "America/Lower_Princes", "America/Maceio", "America/Managua",
    "America/Manaus", "America/Marigot", "America/Martinique", "America/Matamoros", "America/Mazatlan",
    "America/Menominee", "America/Merida", "America/Metlakatla", "America/Mexico_City", "America/Miquelon",
    "America/Moncton", "America/Monterrey", "America/Montevideo", "America/Montserrat", "America/Nassau",
    "America/New_York", "America/Nipigon", "America/Nome", "America/Noronha", "America/North_Dakota/Beulah",
    "America/North_Dakota/Center", "America/North_Dakota/New_Salem", "America/Nuuk", "America/Ojinaga",
    "America/Panama", "America/Pangnirtung", "America/Paramaribo", "America/Phoenix", "America/Port-au-Prince",
    "America/Port_of_Spain", "America/Porto_Velho", "America/Puerto_Rico", "America/Punta_Arenas",
    "America/Rainy_River", "America/Rankin_Inlet", "America/Recife", "America/Regina", "America/Resolute",
    "America/Rio_Branco", "America/Santarem", "America/Santiago", "America/Santo_Domingo", "America/Sao_Paulo",
    "America/Scoresbysund", "America/Sitka", "America/St_Barthelemy", "America/St_Johns", "America/St_Kitts",
    "America/St_Lucia", "America/St_Thomas", "America/St_Vincent", "America/Swift_Current", "America/Tegucigalpa",
    "America/Thule", "America/Thunder_Bay", "America/Tijuana", "America/Toronto", "America/Tortola",
    "America/Vancouver", "America/Whitehorse", "America/Winnipeg", "America/Yakutat", "America/Yellowknife",
    // Antarctica
    "Antarctica/Casey", "Antarctica/Davis", "Antarctica/DumontDUrville", "Antarctica/Macquarie",
    "Antarctica/Mawson", "Antarctica/McMurdo", "Antarctica/Palmer", "Antarctica/Rothera",
    "Antarctica/Syowa", "Antarctica/Troll", "Antarctica/Vostok",
    // Arctic
    "Arctic/Longyearbyen",
    // Asia
    "Asia/Aden", "Asia/Almaty", "Asia/Amman", "Asia/Anadyr", "Asia/Aqtau", "Asia/Aqtobe", "Asia/Ashgabat",
    "Asia/Atyrau", "Asia/Baghdad", "Asia/Bahrain", "Asia/Baku", "Asia/Bangkok", "Asia/Barnaul", "Asia/Beirut",
    "Asia/Bishkek", "Asia/Brunei", "Asia/Chita", "Asia/Choibalsan", "Asia/Colombo", "Asia/Damascus",
    "Asia/Dhaka", "Asia/Dili", "Asia/Dubai", "Asia/Dushanbe", "Asia/Famagusta", "Asia/Gaza", "Asia/Hebron",
    "Asia/Ho_Chi_Minh", "Asia/Hong_Kong", "Asia/Hovd", "Asia/Irkutsk", "Asia/Jakarta", "Asia/Jayapura",
    "Asia/Jerusalem", "Asia/Kabul", "Asia/Kamchatka", "Asia/Karachi", "Asia/Kathmandu", "Asia/Khandyga",
    "Asia/Kolkata", "Asia/Krasnoyarsk", "Asia/Kuala_Lumpur", "Asia/Kuching", "Asia/Kuwait", "Asia/Macau",
    "Asia/Magadan", "Asia/Makassar", "Asia/Manila", "Asia/Muscat", "Asia/Nicosia", "Asia/Novokuznetsk",
    "Asia/Novosibirsk", "Asia/Omsk", "Asia/Oral", "Asia/Phnom_Penh", "Asia/Pontianak", "Asia/Pyongyang",
    "Asia/Qatar", "Asia/Qostanay", "Asia/Qyzylorda", "Asia/Riyadh", "Asia/Sakhalin", "Asia/Samarkand",
    "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Srednekolymsk", "Asia/Taipei", "Asia/Tashkent",
    "Asia/Tbilisi", "Asia/Tehran", "Asia/Thimphu", "Asia/Tokyo", "Asia/Tomsk", "Asia/Ulaanbaatar",
    "Asia/Urumqi", "Asia/Ust-Nera", "Asia/Vientiane", "Asia/Vladivostok", "Asia/Yakutsk", "Asia/Yangon",
    "Asia/Yekaterinburg", "Asia/Yerevan",
    // Atlantic
    "Atlantic/Azores", "Atlantic/Bermuda", "Atlantic/Canary", "Atlantic/Cape_Verde", "Atlantic/Faroe",
    "Atlantic/Madeira", "Atlantic/Reykjavik", "Atlantic/South_Georgia", "Atlantic/St_Helena", "Atlantic/Stanley",
    // Australia
    "Australia/Adelaide", "Australia/Brisbane", "Australia/Broken_Hill", "Australia/Currie", "Australia/Darwin",
    "Australia/Eucla", "Australia/Hobart", "Australia/Lindeman", "Australia/Lord_Howe", "Australia/Melbourne",
    "Australia/Perth", "Australia/Sydney",
    // Europe
    "Europe/Amsterdam", "Europe/Andorra", "Europe/Astrakhan", "Europe/Athens", "Europe/Belgrade", "Europe/Berlin",
    "Europe/Bratislava", "Europe/Brussels", "Europe/Bucharest", "Europe/Budapest", "Europe/Busingen",
    "Europe/Chisinau", "Europe/Copenhagen", "Europe/Dublin", "Europe/Gibraltar", "Europe/Guernsey",
    "Europe/Helsinki", "Europe/Isle_of_Man", "Europe/Istanbul", "Europe/Jersey", "Europe/Kaliningrad",
    "Europe/Kiev", "Europe/Kirov", "Europe/Lisbon", "Europe/Ljubljana", "Europe/London", "Europe/Luxembourg",
    "Europe/Madrid", "Europe/Malta", "Europe/Mariehamn", "Europe/Minsk", "Europe/Monaco", "Europe/Moscow",
    "Europe/Oslo", "Europe/Paris", "Europe/Podgorica", "Europe/Prague", "Europe/Riga", "Europe/Rome",
    "Europe/Samara", "Europe/San_Marino", "Europe/Sarajevo", "Europe/Saratov", "Europe/Simferopol",
    "Europe/Skopje", "Europe/Sofia", "Europe/Stockholm", "Europe/Tallinn", "Europe/Tirane", "Europe/Ulyanovsk",
    "Europe/Uzhgorod", "Europe/Vaduz", "Europe/Vatican", "Europe/Vienna", "Europe/Vilnius", "Europe/Volgograd",
    "Europe/Warsaw", "Europe/Zagreb", "Europe/Zaporozhye", "Europe/Zurich",
    // Indian
    "Indian/Antananarivo", "Indian/Chagos", "Indian/Christmas", "Indian/Cocos", "Indian/Comoro",
    "Indian/Kerguelen", "Indian/Mahe", "Indian/Maldives", "Indian/Mauritius", "Indian/Mayotte", "Indian/Reunion",
    // Pacific
    "Pacific/Apia", "Pacific/Auckland", "Pacific/Bougainville", "Pacific/Chatham", "Pacific/Chuuk", "Pacific/Easter",
    "Pacific/Efate", "Pacific/Enderbury", "Pacific/Fakaofo", "Pacific/Fiji", "Pacific/Funafuti", "Pacific/Galapagos",
    "Pacific/Gambier", "Pacific/Guadalcanal", "Pacific/Guam", "Pacific/Honolulu", "Pacific/Kanton",
    "Pacific/Kiritimati", "Pacific/Kosrae", "Pacific/Kwajalein", "Pacific/Majuro", "Pacific/Marquesas",
    "Pacific/Midway", "Pacific/Nauru", "Pacific/Niue", "Pacific/Norfolk", "Pacific/Noumea", "Pacific/Pago_Pago",
    "Pacific/Palau", "Pacific/Pitcairn", "Pacific/Pohnpei", "Pacific/Port_Moresby", "Pacific/Rarotonga",
    "Pacific/Saipan", "Pacific/Tahiti", "Pacific/Tarawa", "Pacific/Tongatapu", "Pacific/Wake", "Pacific/Wallis",
    // Others
    "Etc/GMT", "Etc/GMT+0", "Etc/GMT+1", "Etc/GMT+10", "Etc/GMT+11", "Etc/GMT+12", "Etc/GMT+2", "Etc/GMT+3",
    "Etc/GMT+4", "Etc/GMT+5", "Etc/GMT+6", "Etc/GMT+7", "Etc/GMT+8", "Etc/GMT+9", "Etc/GMT-0", "Etc/GMT-1",
    "Etc/GMT-10", "Etc/GMT-11", "Etc/GMT-12", "Etc/GMT-13", "Etc/GMT-14", "Etc/GMT-2", "Etc/GMT-3",
    "Etc/GMT-4", "Etc/GMT-5", "Etc/GMT-6", "Etc/GMT-7", "Etc/GMT-8", "Etc/GMT-9", "Etc/UCT", "Etc/UTC"
];

// Initialize timezone dropdowns with Choices.js
async function initTimezoneDropdowns(sourceSelect, targetSelect) {
    // Load settings for targetTimezone
    const settings = await loadFromStore('settings');
    const settingsData = settings.find(s => s.id === 'settings') || { targetTimezone: 'UTC' };
    const defaultTargetTimezone = settingsData.targetTimezone;

    // Load activeAccountId and associated broker for sourceTimezone
    let defaultSourceTimezone = 'UTC';
    if (settingsData.activeAccountId) {
        const accounts = await loadFromStore('accounts');
        const activeAccount = accounts.find(a => a.id === parseInt(settingsData.activeAccountId));
        if (activeAccount && activeAccount.brokerId) {
            const brokers = await loadFromStore('brokers');
            const broker = brokers.find(b => b.id === activeAccount.brokerId);
            if (broker && broker.timezone) {
                defaultSourceTimezone = broker.timezone;
            }
        }
    }

    const options = [
        { value: 'UTC', label: 'UTC (Default)', customProperties: { region: 'Others' } },
        ...COMMON_TIMEZONES.filter(tz => tz !== 'UTC').map(tz => {
            let label = tz;
            if (tz.startsWith('Etc/GMT')) {
                const offsetMatch = tz.match(/Etc\/GMT([+-]?\d+)/);
                if (offsetMatch) {
                    const offset = parseInt(offsetMatch[1], 10);
                    label = `GMT${offset <= 0 ? '+' : '-'}${Math.abs(offset)}`;
                }
            }
            let region = 'Others';
            if (tz.startsWith('Africa/')) region = 'Africa';
            else if (tz.startsWith('America/')) region = 'America';
            else if (tz.startsWith('Antarctica/')) region = 'Antarctica';
            else if (tz.startsWith('Arctic/')) region = 'Arctic';
            else if (tz.startsWith('Asia/')) region = 'Asia';
            else if (tz.startsWith('Atlantic/')) region = 'Atlantic';
            else if (tz.startsWith('Australia/')) region = 'Australia';
            else if (tz.startsWith('Europe/')) region = 'Europe';
            else if (tz.startsWith('Indian/')) region = 'Indian';
            else if (tz.startsWith('Pacific/')) region = 'Pacific';
            return { value: tz, label, customProperties: { region } };
        })
    ];

    options.sort((a, b) => {
        if (a.customProperties.region === b.customProperties.region) {
            return a.label.localeCompare(b.label);
        }
        return a.customProperties.region.localeCompare(b.customProperties.region);
    });

    const groupedOptions = options.reduce((acc, opt) => {
        if (!acc[opt.customProperties.region]) {
            acc[opt.customProperties.region] = [];
        }
        acc[opt.customProperties.region].push(opt);
        return acc;
    }, {});

    const html = Object.entries(groupedOptions)
        .map(([region, opts]) => `
            <optgroup label="${region}">
                ${opts.map(opt => `<option value="${opt.value}" ${opt.value === defaultSourceTimezone ? 'selected' : ''}>${opt.label}</option>`).join('')}
            </optgroup>
        `)
        .join('');

    sourceSelect.innerHTML = html;
    targetSelect.innerHTML = Object.entries(groupedOptions)
        .map(([region, opts]) => `
            <optgroup label="${region}">
                ${opts.map(opt => `<option value="${opt.value}" ${opt.value === defaultTargetTimezone ? 'selected' : ''}>${opt.label}</option>`).join('')}
            </optgroup>
        `)
        .join('');

    new Choices(sourceSelect, {
        searchEnabled: true,
        placeholder: true,
        placeholderValue: 'Select Source Timezone',
        itemSelectText: '',
        shouldSort: false
    });
    new Choices(targetSelect, {
        searchEnabled: true,
        placeholder: true,
        placeholderValue: 'Select Target Timezone',
        itemSelectText: '',
        shouldSort: false
    });
}

// Fuzzy matching function for headers
function fuzzyMatch(str1, str2) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s1 = clean(str1);
    const s2 = clean(str2);
    if (s1 === s2) return 100;
    const minLength = Math.min(s1.length, s2.length);
    let matches = 0;
    for (let i = 0; i < minLength; i++) {
        if (s1[i] === s2[i]) matches++;
    }
    let score = (matches / Math.max(s1.length, s2.length)) * 100; // Changed to let
    // Boost score for partial matches containing key terms
    if (s1.includes('open') && s2.includes('open')) score += 10;
    if (s1.includes('time') && s2.includes('time')) score += 10;
    return Math.min(score, 100);
}


// Validate price for market type
function validatePrice(price, marketType, fieldName) {
    const value = parseFloat(price);
    if (isNaN(value) || value <= 0) {
        console.warn(`Invalid ${fieldName} for ${marketType}: ${price}`);
        return false;
    }
    // Relaxed ranges to allow valid prices
    if (marketType === 'forex' && (value < 0.1 || value > 10)) {
        console.warn(`Unusual ${fieldName} for forex: ${price}`);
        return true;
    }
    if (marketType === 'indices' && (value < 1000 || value > 50000)) {
        console.warn(`Unusual ${fieldName} for indices: ${price}`);
        return true;
    }
    return true;
}

// Custom rounding function for exact decimal precision
function preciseRound(value, decimals) {
    const sign = value >= 0 ? 1 : -1;
    const absValue = Math.abs(value);
    const str = absValue.toString();
    const parts = str.split('.');
    let integerPart = parts[0];
    let decimalPart = parts[1] || '';
    decimalPart = (decimalPart + '0'.repeat(decimals)).slice(0, decimals + 2);
    const fullNumber = parseFloat(`${integerPart}.${decimalPart}`);
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(fullNumber * factor) / factor;
    return Number.parseFloat((sign * rounded).toFixed(decimals));
}

// Calculate pip value based on market type, position, and multipliers
// Calculate pip value based on market type and position
function calculatePipValue(entryPrice, exitPrice, position, marketType, symbol) {
    if (!entryPrice || !exitPrice) return 0;
    const priceDiff = exitPrice - entryPrice;
    let pipSize;

    if (marketType === 'forex') {
        pipSize = symbol && symbol.endsWith('JPY') ? 0.01 : 0.0001;
    } else if (marketType === 'indices') {
        pipSize = 0.01;
    } else if (marketType === 'commodities') {
        pipSize = 0.01;
    } else if (marketType === 'crypto') {
        pipSize = 0.01;
    } else {
        console.warn(`Unknown market type for pip calculation: ${marketType}`);
        return 0;
    }

    let pipValue;
    if (position === 'buy') {
        pipValue = priceDiff / pipSize;
    } else if (position === 'sell') {
        pipValue = -priceDiff / pipSize;
    } else {
        console.warn(`Invalid position for pip calculation: ${position}`);
        return 0;
    }

    // Adjust scaling based on market type to match cTrader Pips format
    if (marketType === 'indices') {
        // Indices need / 10 to match cTrader Pips format (e.g., -2342.0 -> -234.2)
        return Number.parseFloat((pipValue / 10).toFixed(1));
    } else {
        // Forex and other types already match cTrader Pips (e.g., 44.4)
        return Number.parseFloat(pipValue.toFixed(1));
    }
}

// Calculate stop loss distance in points/pips
function calculateStopLossDistance(entryPrice, slPrice, marketType, symbol) {
    if (!slPrice || slPrice === 0) return 0;
    if (marketType === 'forex') {
        const pipSize = symbol && symbol.endsWith('JPY') ? 0.01 : 0.0001;
        return Math.abs(entryPrice - slPrice) / pipSize;
    } else if (marketType === 'indices') {
        return Math.abs(entryPrice - slPrice);
    }
    return Math.abs(entryPrice - slPrice); // Default for commodities, crypto
}

// Calculate hold time in minutes
function calculateHoldTime(entryDatetime, exitDatetime) {
    if (!entryDatetime || !exitDatetime) return 0;
    const parseDate = (dateStr) => {
        try {
            const [datePart, timePart] = dateStr.split(' ');
            const [day, month, year] = datePart.split('/').map(Number);
            const [hours, minutes, seconds] = timePart.split(':').map(s => Number(s.split('.')[0]));
            return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        } catch (err) {
            console.warn(`Invalid datetime for hold time: ${dateStr}`);
            return null;
        }
    };
    const entry = parseDate(entryDatetime);
    const exit = parseDate(exitDatetime);
    if (!entry || !exit || isNaN(entry) || isNaN(exit)) return 0;
    return Math.round((exit - entry) / (1000 * 60)); // Convert ms to minutes
}

// Calculate market risk
async function calculateMarketRisk(trade, multipliers, baseCurrency) {
    console.log('Calculating market risk for trade:', { symbol: trade.symbol, market_type: trade.market_type, entry_price: trade.entry_price, stop_loss: trade.stop_loss, lot: trade.lot });
    let entry = parseFloat(trade.entry_price) || 0;
    let stop = parseFloat(trade.stop_loss) || 0;
    const lot = parseFloat(trade.lot) || 1;
    
    if (!validatePrice(entry, trade.market_type, 'entry_price') || (stop !== 0 && !validatePrice(stop, trade.market_type, 'stop_loss')) || lot <= 0) {
        console.warn('Invalid inputs for market risk calculation:', { entry, stop, lot });
        return null;
    }

    // Skip risk calculation if stop is 0
    if (stop === 0) {
        console.log('Stop loss is 0, skipping risk calculation');
        return null;
    }

    let riskAmountUSD;
    if (trade.market_type === 'indices') {
        const multiplierPerPoint = multipliers.indices || 1;
        console.log('Indices multiplier:', multiplierPerPoint);
        const points = Math.abs(entry - stop);
        riskAmountUSD = points * multiplierPerPoint * lot;
        console.log('Indices Market Risk Calc:', { entry, stop, lot, points, multiplierPerPoint, riskAmountUSD });
    } else if (trade.market_type === 'forex') {
        const pipValuePerLot = multipliers.forex || 10;
        const pipSize = trade.symbol && trade.symbol.endsWith('JPY') ? 0.01 : 0.0001;
        const pips = Math.abs(entry - stop) / pipSize;
        riskAmountUSD = pips * pipValuePerLot * lot;
        console.log('Forex Market Risk Calc:', { entry, stop, lot, pipSize, pips, pipValuePerLot, riskAmountUSD });
    } else if (trade.market_type === 'commodities') {
        const multiplierPerPoint = trade.symbol === 'XAGUSD' 
            ? (multipliers.commodities_exceptions?.XAGUSD || 5) 
            : (trade.symbol === 'XAUUSD' ? (multipliers.commodities_exceptions?.XAUUSD || 100) : (multipliers.commodities || 1));
        console.log('Commodities multiplier:', multiplierPerPoint);
        const points = Math.abs(entry - stop);
        riskAmountUSD = points * multiplierPerPoint * lot;
        console.log('Commodities Market Risk Calc:', { entry, stop, lot, points, multiplierPerPoint, riskAmountUSD });
    } else if (trade.market_type === 'crypto') {
        const multiplierPerPoint = multipliers.crypto || 0.01;
        console.log('Crypto multiplier:', multiplierPerPoint);
        const points = Math.abs(entry - stop);
        riskAmountUSD = points * multiplierPerPoint * lot;
        console.log('Crypto Market Risk Calc:', { entry, stop, lot, points, multiplierPerPoint, riskAmountUSD });
    } else {
        console.warn('Unknown market type:', trade.market_type);
        riskAmountUSD = 0;
        console.log('Fallback Market Risk Calc:', { entry, stop, lot, market_type: trade.market_type, riskAmountUSD });
    }

    console.log('Calculated riskAmountUSD:', riskAmountUSD);
    const riskAmountConverted = baseCurrency === 'CAD' ? (riskAmountUSD * 1.35) : riskAmountUSD;
    console.log('Final Market Risk Calc:', { market_type: trade.market_type, symbol: trade.symbol, riskAmountUSD, baseCurrency, riskAmountConverted });
    return Number.parseFloat(riskAmountConverted.toFixed(2));
}

// Calculate planned reward-to-risk ratio
function calculatePlannedRR(trade, multipliers) {
    console.log('Calculating planned RR for trade:', { symbol: trade.symbol, market_type: trade.market_type });
    const entry = parseFloat(trade.entry_price) || 0;
    const stop = parseFloat(trade.stop_loss) || 0;
    const take = parseFloat(trade.take_profit) || 0;
    const lot = parseFloat(trade.lot) || 1;
    
    if (!validatePrice(entry, trade.market_type, 'entry_price') || !validatePrice(stop, trade.market_type, 'stop_loss') || 
        !validatePrice(take, trade.market_type, 'take_profit') || lot <= 0 || stop === 0 || take === 0) {
        console.warn('Invalid inputs for planned RR:', { entry, stop, take, lot });
        return null;
    }

    let multiplierPerPoint;
    if (trade.market_type === 'indices') {
        multiplierPerPoint = multipliers.indices || 1;
        const pointsRisk = Math.abs(entry - stop);
        const pointsReward = Math.abs(take - entry);
        const riskUSD = pointsRisk * multiplierPerPoint * lot;
        const rewardUSD = pointsReward * multiplierPerPoint * lot;
        const rr = riskUSD > 0 ? (rewardUSD / riskUSD) : null;
        console.log('Planned RR for indices:', { pointsRisk, pointsReward, riskUSD, rewardUSD, rr });
        return rr !== null ? Math.min(Math.max(preciseRound(rr, 2), -10), 10) : null;
    } else if (trade.market_type === 'forex') {
        multiplierPerPoint = multipliers.forex || 10;
        const pipSize = trade.symbol && trade.symbol.endsWith('JPY') ? 0.01 : 0.0001;
        const pipsRisk = Math.abs(entry - stop) / pipSize;
        const pipsReward = Math.abs(take - entry) / pipSize;
        const riskUSD = pipsRisk * multiplierPerPoint * lot;
        const rewardUSD = pipsReward * multiplierPerPoint * lot;
        const rr = riskUSD > 0 ? (rewardUSD / riskUSD) : null;
        console.log('Planned RR for forex:', { pipsRisk, pipsReward, riskUSD, rewardUSD, rr });
        return rr !== null ? Math.min(Math.max(preciseRound(rr, 2), -10), 10) : null;
    } else if (trade.market_type === 'commodities') {
        multiplierPerPoint = trade.symbol === 'XAGUSD' 
            ? (multipliers.commodities_exceptions?.XAGUSD || 5) 
            : (trade.symbol === 'XAUUSD' ? (multipliers.commodities_exceptions?.XAUUSD || 100) : (multipliers.commodities || 1));
        const pointsRisk = Math.abs(entry - stop);
        const pointsReward = Math.abs(take - entry);
        const riskUSD = pointsRisk * multiplierPerPoint * lot;
        const rewardUSD = pointsReward * multiplierPerPoint * lot;
        const rr = riskUSD > 0 ? (rewardUSD / riskUSD) : null;
        console.log('Planned RR for commodities:', { pointsRisk, pointsReward, riskUSD, rewardUSD, rr });
        return rr !== null ? Math.min(Math.max(preciseRound(rr, 2), -10), 10) : null;
    } else if (trade.market_type === 'crypto') {
        multiplierPerPoint = multipliers.crypto || 0.01;
        const pointsRisk = Math.abs(entry - stop);
        const pointsReward = Math.abs(take - entry);
        const riskUSD = pointsRisk * multiplierPerPoint * lot;
        const rewardUSD = pointsReward * multiplierPerPoint * lot;
        const rr = riskUSD > 0 ? (rewardUSD / riskUSD) : null;
        console.log('Planned RR for crypto:', { pointsRisk, pointsReward, riskUSD, rewardUSD, rr });
        return rr !== null ? Math.min(Math.max(preciseRound(rr, 2), -10), 10) : null;
    } else {
        console.warn('Unknown market type for planned RR:', trade.market_type);
        return null;
    }
}

// Calculate actual reward-to-risk ratio
function calculateActualRR(trade, multipliers) {
    console.log('Calculating actual RR for trade:', { symbol: trade.symbol, market_type: trade.market_type, entry_price: trade.entry_price, stop_loss: trade.stop_loss, exit_price: trade.exit_price, position: trade.position });
    const entry = parseFloat(trade.entry_price) || 0;
    const stop = parseFloat(trade.stop_loss) || 0;
    const exit = parseFloat(trade.exit_price) || 0;
    const lot = parseFloat(trade.lot) || 1;
    
    if (!validatePrice(entry, trade.market_type, 'entry_price') || !validatePrice(stop, trade.market_type, 'stop_loss') || 
        !validatePrice(exit, trade.market_type, 'exit_price') || lot <= 0 || stop === 0) {
        console.warn('Invalid inputs for actual RR:', { entry, stop, exit, lot });
        return null;
    }

    let multiplierPerPoint;
    let actualRR;
    if (trade.market_type === 'indices') {
        multiplierPerPoint = multipliers.indices || 1;
        const risk = trade.position === 'buy' ? (entry - stop) : (stop - entry);
        const reward = trade.position === 'buy' ? (exit - entry) : (entry - exit);
        const absRisk = Math.abs(risk);
        // Apply minimum risk threshold to avoid extreme RR
        const minRisk = 0.5; // Minimum risk in points
        const adjustedRisk = Math.max(absRisk, minRisk);
        const riskUSD = adjustedRisk * multiplierPerPoint * lot;
        const rewardUSD = reward * multiplierPerPoint * lot;
        actualRR = riskUSD > 0 ? (rewardUSD / riskUSD) : null;
        console.log('Actual RR for indices:', { risk, reward, absRisk, adjustedRisk, riskUSD, rewardUSD, actualRR });
        return actualRR !== null ? Math.min(Math.max(preciseRound(actualRR, 2), -10), 10) : null;
    } else if (trade.market_type === 'forex') {
        multiplierPerPoint = multipliers.forex || 10;
        const pipSize = trade.symbol && trade.symbol.endsWith('JPY') ? 0.01 : 0.0001;
        const pipsRisk = trade.position === 'buy' ? (entry - stop) / pipSize : (stop - entry) / pipSize;
        const pipsReward = trade.position === 'buy' ? (exit - entry) : (entry - exit) / pipSize;
        const absPipsRisk = Math.abs(pipsRisk);
        const minPipsRisk = 5; // Minimum risk in pips
        const adjustedPipsRisk = Math.max(absPipsRisk, minPipsRisk);
        const riskUSD = adjustedPipsRisk * multiplierPerPoint * lot;
        const rewardUSD = pipsReward * multiplierPerPoint * lot;
        actualRR = riskUSD > 0 ? (rewardUSD / riskUSD) : null;
        console.log('Actual RR for forex:', { pipsRisk, pipsReward, absPipsRisk, adjustedPipsRisk, riskUSD, rewardUSD, actualRR });
        return actualRR !== null ? Math.min(Math.max(preciseRound(actualRR, 2), -10), 10) : null;
    } else if (trade.market_type === 'commodities') {
        multiplierPerPoint = trade.symbol === 'XAGUSD' 
            ? (multipliers.commodities_exceptions?.XAGUSD || 5) 
            : (trade.symbol === 'XAUUSD' ? (multipliers.commodities_exceptions?.XAUUSD || 100) : (multipliers.commodities || 1));
        const risk = trade.position === 'buy' ? (entry - stop) : (stop - entry);
        const reward = trade.position === 'buy' ? (exit - entry) : (entry - exit);
        const absRisk = Math.abs(risk);
        const minRisk = 0.5; // Minimum risk in points
        const adjustedRisk = Math.max(absRisk, minRisk);
        const riskUSD = adjustedRisk * multiplierPerPoint * lot;
        const rewardUSD = reward * multiplierPerPoint * lot;
        actualRR = riskUSD > 0 ? (rewardUSD / riskUSD) : null;
        console.log('Actual RR for commodities:', { risk, reward, absRisk, adjustedRisk, riskUSD, rewardUSD, actualRR });
        return actualRR !== null ? Math.min(Math.max(preciseRound(actualRR, 2), -10), 10) : null;
    } else if (trade.market_type === 'crypto') {
        multiplierPerPoint = multipliers.crypto || 0.01;
        const risk = trade.position === 'buy' ? (entry - stop) : (stop - entry);
        const reward = trade.position === 'buy' ? (exit - entry) : (entry - exit);
        const absRisk = Math.abs(risk);
        const minRisk = 0.5; // Minimum risk in points
        const adjustedRisk = Math.max(absRisk, minRisk);
        const riskUSD = adjustedRisk * multiplierPerPoint * lot;
        const rewardUSD = reward * multiplierPerPoint * lot;
        actualRR = riskUSD > 0 ? (rewardUSD / riskUSD) : null;
        console.log('Actual RR for crypto:', { risk, reward, absRisk, adjustedRisk, riskUSD, rewardUSD, actualRR });
        return actualRR !== null ? Math.min(Math.max(preciseRound(actualRR, 2), -10), 10) : null;
    } else {
        console.warn('Unknown market type for actual RR:', trade.market_type);
        return null;
    }
}



// Add function to fetch multipliers from broker table
// Fetch multipliers and pip sizes from broker table
async function fetchMultipliers(brokerId) {
    try {
        const brokers = await loadFromStore('brokers');
        const broker = brokers.find(b => b.id === brokerId);
        if (!broker || !broker.multipliers) {
            console.warn(`No multipliers found for brokerId ${brokerId}, using default multipliers`);
            return {
                forex: 10,
                indices: 1,
                commodities: 1,
                commodities_exceptions: { XAGUSD: 5, XAUUSD: 100 },
                crypto: 0.01,
                pipSize: {
                    forex: 0.0001, // Standard for non-JPY pairs
                    forex_jpy: 0.01, // JPY pairs
                    indices: 1.0, // Matches provided CSV (index points)
                    commodities: 0.01,
                    crypto: 0.01
                }
            };
        }
        // Ensure pipSize defaults if not provided by broker
        broker.multipliers.pipSize = broker.multipliers.pipSize || {
            forex: 0.0001,
            forex_jpy: 0.01,
            indices: 1.0,
            commodities: 0.01,
            crypto: 0.01
        };
        return broker.multipliers;
    } catch (err) {
        console.error('Error fetching multipliers:', err);
        return {
            forex: 10,
            indices: 1,
            commodities: 1,
            commodities_exceptions: { XAGUSD: 5, XAUUSD: 100 },
            crypto: 0.01,
            pipSize: {
                forex: 0.0001,
                forex_jpy: 0.01,
                indices: 1.0,
                commodities: 0.01,
                crypto: 0.01
            }
        };
    }
}


// Add function to ensure a default broker exists and is assigned
 async function ensureBrokerForAccount(accountId) {
    try {
        const accounts = await loadFromStore('accounts');
        const account = accounts.find(a => a.id === parseInt(accountId));
        if (!account) {
            throw new Error('No account found for the selected account ID.');
        }

        const brokers = await loadFromStore('brokers');
        if (!brokers || brokers.length === 0) {
            throw new Error('No broker data found in the database. Please set up a broker first.');
        }

        if (!account.brokerId) {
            // Assign the first broker as default
            account.brokerId = brokers[0].id;
            await saveToStore('accounts', account);
            console.log(`Assigned default broker ID ${brokers[0].id} to account ID ${accountId}`);
            showToast(`Assigned default broker to account ${account.name}.`, 'info');
        }

        return account;
    } catch (err) {
        console.error('Error ensuring broker for account:', err);
        throw err;
    }
}

// Calculate pip value for CSV imports, aligning with CSV Pips column and broker settings
function calculateCsvPipValue(entryPrice, exitPrice, position, marketType, symbol, multipliers, csvPips) {
    if (!entryPrice || !exitPrice) return 0;
    const priceDiff = exitPrice - entryPrice;
    let pipSize;

    if (marketType === 'forex') {
        pipSize = symbol && symbol.endsWith('JPY') ? multipliers.pipSize.forex_jpy : multipliers.pipSize.forex;
    } else if (marketType === 'indices') {
        pipSize = multipliers.pipSize.indices;
    } else if (marketType === 'commodities') {
        pipSize = multipliers.pipSize.commodities;
    } else if (marketType === 'crypto') {
        pipSize = multipliers.pipSize.crypto;
    } else {
        console.warn(`Unknown market type for pip calculation: ${marketType}`);
        return 0;
    }

    let pipValue;
    if (position === 'buy') {
        pipValue = priceDiff / pipSize;
    } else if (position === 'sell') {
        pipValue = -priceDiff / pipSize;
    } else {
        console.warn(`Invalid position for pip calculation: ${position}`);
        return 0;
    }

    // Apply market-specific scaling
    if (marketType === 'forex') {
        pipValue *= 10; // Forex CSVs often report pips as 10x (e.g., -10.8 -> -108.0)
    }

    // Validate against CSV Pips column if provided
    if (csvPips !== undefined && !isNaN(parseFloat(csvPips))) {
        const csvPipValue = parseFloat(csvPips);
        const calculatedPipValue = Number.parseFloat(pipValue.toFixed(1));
        if (Math.abs(calculatedPipValue) > 0) {
            const ratio = Math.abs(csvPipValue / calculatedPipValue);
            if (marketType === 'indices' && ratio >= 95 && ratio <= 105) {
                pipValue = csvPipValue / 100; // Use CSV Pips / 100 for indices
                console.log(`Set pip value for ${symbol}: ${calculatedPipValue} -> ${pipValue} to match CSV Pips: ${csvPipValue}`);
            } else if (marketType === 'forex' && Math.abs(calculatedPipValue - csvPipValue) > 0.1) {
                pipValue = csvPipValue; // Use CSV Pips directly for forex to match exactly
                console.log(`Set pip value for ${symbol}: ${calculatedPipValue} -> ${pipValue} to match CSV Pips: ${csvPipValue}`);
            } else if (ratio >= 9.5 && ratio <= 10.5) {
                pipValue /= 10; // Adjust for 10x scaling
                console.log(`Adjusted pip value for ${symbol}: ${calculatedPipValue} -> ${pipValue} to match CSV Pips: ${csvPipValue}`);
            } else if (Math.abs(calculatedPipValue - csvPipValue) > 0.1) {
                console.warn(`Pip value mismatch for ${symbol}: Calculated ${calculatedPipValue}, CSV ${csvPipValue}`);
            }
        }
    }

    return Number.parseFloat(pipValue.toFixed(1));
}

// Initialize the import modal
export async function initImportModal() {
    try {
        const Papa = await waitForPapaParse();
        
        // Retry DOM element lookup
        const maxRetries = 5;
        const retryDelay = 200;
        let elements = null;
        for (let i = 0; i < maxRetries; i++) {
            elements = {
                fileInput: document.getElementById('import-file'),
                fileTypeSelect: document.getElementById('file-type'),
                 sourceTimezoneSelect: document.getElementById('source-timezone-select'),
                targetTimezoneSelect: document.getElementById('target-timezone-select'),
                timezoneSection: document.getElementById('timezone-selection'),
                targetTimezoneSection: document.getElementById('target-timezone-selection'),
                columnMappingSection: document.getElementById('column-mapping-section'),
                columnMappingsDiv: document.getElementById('column-mappings'),
                previewSection: document.getElementById('preview-section'),
                previewTable: document.getElementById('preview-table'),
                submitButton: document.getElementById('submit-import'),
                confirmButton: document.getElementById('confirm-import'),
                feedbackDiv: document.getElementById('import-feedback')
            };
            if (Object.values(elements).every(el => el)) break;
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        // Check for missing elements
        const missingElements = Object.entries(elements)
            .filter(([key, value]) => !value)
            .map(([key]) => key);
        if (missingElements.length > 0) {
            const errorMsg = `Missing modal elements: ${missingElements.join(', ')}`;
            console.error(errorMsg);
            showToast(errorMsg, 'error');
            throw new Error(errorMsg);
        }

 const {
            fileInput,
            fileTypeSelect,
            sourceTimezoneSelect,
            targetTimezoneSelect,
            timezoneSection,
            targetTimezoneSection,
            columnMappingSection,
            columnMappingsDiv,
            previewSection,
            previewTable,
            submitButton,
            confirmButton,
            feedbackDiv
        } = elements;

        await openDB();

            // Initialize timezone dropdowns
        initTimezoneDropdowns(sourceTimezoneSelect, targetTimezoneSelect);

        // Get active accountId from top header dropdown or settings
        const settings = await loadFromStore('settings');
        const activeAccountId = document.getElementById('active-account')?.value || settings[0]?.activeAccountId;
        if (!activeAccountId) {
            const errorMsg = 'No active account selected. Please select an account from the top header or settings.';
            console.error(errorMsg);
            showToast(errorMsg, 'error');
            throw new Error(errorMsg);
        }

        // Ensure account exists and has a broker assigned
        try {
            await ensureBrokerForAccount(activeAccountId);
        } catch (err) {
            const errorMsg = err.message === 'No broker data found in the database. Please set up a broker first.'
                ? 'No broker data found. Please set up a broker in the settings before importing trades.'
                : 'Failed to verify account and broker setup. Please ensure an account and broker are configured.';
            console.error(errorMsg, err);
            showToast(errorMsg, 'error');
            throw err;
        }

   // Enable file input and timezone sections based on file type
        fileInput.disabled = true;
        console.log('Initial file input state: disabled');
        fileTypeSelect.addEventListener('change', () => {
            console.log('File type selected:', fileTypeSelect.value);
            const validFileTypes = ['csv', 'mt5', 'ctrader'];
            const isValid = validFileTypes.includes(fileTypeSelect.value);
            fileInput.disabled = !isValid;
            console.log('File input disabled:', fileInput.disabled);
            fileInput.value = ''; // Reset file input
            columnMappingSection.style.display = fileTypeSelect.value === 'csv' ? 'block' : 'none';
            timezoneSection.style.display  = ['csv', 'mt5'].includes(fileTypeSelect.value) ? 'block' : 'none'; // Updated to include 'csv'
            targetTimezoneSection.style.display  = ['csv', 'mt5'].includes(fileTypeSelect.value) ? 'block' : 'none'; // Updated to include 'csv'
            columnMappingsDiv.innerHTML = fileTypeSelect.value === 'csv' ? '' : 
                `<p>Fixed column mapping will be applied for ${fileTypeSelect.value.toUpperCase()} HTML.</p>`;
            console.log('Column mappings set:', columnMappingsDiv.innerHTML);
            previewSection.style.display = 'none';
            confirmButton.style.display = 'none';
        }, { once: false });

        // Force initial file type check
        if (fileTypeSelect.value) {
            fileTypeSelect.dispatchEvent(new Event('change'));
        }

        // Handle file selection and automatic column mapping
        let csvHeaders = [];
        let parsedTrades = [];
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (!file) {
                console.log('No file selected');
                return;
            }

            console.log('File selected:', file.name);
            columnMappingsDiv.innerHTML = '';
            previewSection.style.display = 'none';
            confirmButton.style.display = 'none';
            parsedTrades = [];

            if (fileTypeSelect.value === 'csv') {
                console.log('Processing CSV file');
                const text = await file.text();
                Papa.parse(text, {
                    preview: 1,
                    complete: (result) => {
                        csvHeaders = result.meta.fields || [];
                        console.log('CSV headers:', csvHeaders);
                        Object.keys(COLUMN_MAPPINGS).forEach(field => {
                            const div = document.createElement('div');
                            div.className = 'mbkemishra@thoughtworks.com-2';
                            const suggestedHeader = csvHeaders.find(header => 
                                COLUMN_MAPPINGS[field].includes(header) || 
                                header.toLowerCase().includes(field.replace('_', ''))
                            );
                           
                        });
                        console.log('CSV column mappings rendered');
                    },
                    error: (err) => {
                        showToast('Error parsing CSV headers.', 'error');
                        console.error('CSV parse error:', err);
                    }
                });
            } else if (fileTypeSelect.value === 'mt5' || fileTypeSelect.value === 'ctrader') {
                console.log(`Processing ${fileTypeSelect.value.toUpperCase()} HTML file`);
                columnMappingsDiv.innerHTML = `<p>Fixed column mapping will be applied for ${fileTypeSelect.value.toUpperCase()} HTML.</p>`;
                console.log(`${fileTypeSelect.value.toUpperCase()} fixed mapping set`);
            }
        }, { once: false });

        // Handle parse and preview
        submitButton.addEventListener('click', async () => {
            feedbackDiv.innerHTML = '';
            parsedTrades = [];
            const file = fileInput.files[0];
            const fileType = fileTypeSelect.value;
            if (!file || !fileType || !activeAccountId) {
                showToast('Please select a file, file type, and ensure an active account is selected.', 'error');
                console.error('Missing required inputs:', { file: !!file, fileType, activeAccountId });
                return;
            }

            const account = (await loadFromStore('accounts')).find(a => a.id === parseInt(activeAccountId));
            if (!account) {
                showToast('Invalid active account. Please select a valid account from the top header or settings.', 'error');
                console.error('Invalid account ID:', activeAccountId);
                return;
            }

            const baseCurrency = account.baseCurrency || 'USD';
            const multipliers = await fetchMultipliers(account.brokerId);
            console.log('Using multipliers:', multipliers);
            const existingTrades = await loadFromStore('trades');
            const existingPairs = await loadFromStore('pairs');
            const existingKeys = new Set(
                existingTrades
                    .filter(t => t.accountId === parseInt(activeAccountId))
                    .map(t => `${t.accountId}-${t.date}-${t.tradeTime}-${t.pair}-${t.position}-${t.positionId || ''}`)
            );
            console.log('Existing trade keys for account', activeAccountId, ':', Array.from(existingKeys));
            const skippedRows = [];
            let rowIndex = 1;

            try {
if (fileType === 'csv') {
    // Load existing trades from database
    let existingTrades = [];
    try {
        existingTrades = (await loadFromStore('trades')) || [];
        console.log('Loaded existing trades from store:', existingTrades.length, existingTrades.map(t => t.positionId));
    } catch (err) {
        console.error('Error loading existing trades:', err);
        showToast('Failed to load existing trades.', 'error');
    }

    // Initialize existingKeys with trade keys
    const existingKeys = new Set();
    existingTrades.forEach(trade => {
        const tradeKey = `${trade.accountId}-${trade.date}-${trade.tradeTime}-${trade.pair}-${trade.position}-${trade.positionId || ''}`;
        existingKeys.add(tradeKey);
    });
    console.log('Existing keys before CSV parse:', Array.from(existingKeys));

    // Clear fileInput to avoid residual state
    fileInput.value = '';
    console.log('Cleared fileInput for new CSV import');

    try {
        const text = await file.text();
        Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: async (result) => {
                try {
                    // Automatically map CSV columns to fields using COLUMN_MAPPINGS
                    const columnMapping = {};
                    const csvHeaders = result.meta.fields || [];
                    console.log('CSV headers:', csvHeaders);

                    // Handle 'Price' and suffixed 'Price_*' columns
                    let priceColumns = csvHeaders.reduce((acc, header, index) => {
                        if (header.match(/^Price(_\d+)?$/)) acc.push(index);
                        return acc;
                    }, []);
                    console.log('Price column indices:', priceColumns);

                    Object.keys(COLUMN_MAPPINGS).forEach(field => {
                        if (field === 'entry_price' && priceColumns.length > 0) {
                            columnMapping[field] = csvHeaders[priceColumns[0]];
                            console.log(`Mapped field "${field}" to CSV column "${columnMapping[field]}" at index ${priceColumns[0]}`);
                        } else if (field === 'exit_price' && priceColumns.length > 1) {
                            columnMapping[field] = csvHeaders[priceColumns[1]];
                            console.log(`Mapped field "${field}" to CSV column "${columnMapping[field]}" at index ${priceColumns[1]}`);
                        } else {
                            const possibleHeaders = COLUMN_MAPPINGS[field];
                            const matchedHeader = csvHeaders.find(h => 
                                possibleHeaders.includes(h) || 
                                h.toLowerCase().includes(field.replace('_', ''))
                            );
                            if (matchedHeader && !(['entry_price', 'exit_price'].includes(field) && matchedHeader.match(/^Price(_\d+)?$/))) {
                                columnMapping[field] = matchedHeader;
                                console.log(`Mapped field "${field}" to CSV column "${matchedHeader}"`);
                            } else {
                                console.warn(`No matching column found for field "${field}". Expected one of: ${possibleHeaders.join(', ')}`);
                            }
                        }
                    });

                    // Log position_id mapping for debugging
                    console.log('Position ID mapping:', columnMapping.position_id || 'Not mapped');

                    // Relaxed required fields to allow minimal trade data
                    const requiredFields = ['symbol', 'entry_datetime'];
                    const missingFields = requiredFields.filter(field => !columnMapping[field]);
                    if (missingFields.length > 0) {
                        showToast(`Missing required fields in CSV: ${missingFields.join(', ')}`, 'error');
                        console.error('Missing required fields:', missingFields);
                        return;
                    }

                    // Get timezone selections
                    const sourceTimezone = sourceTimezoneSelect.value || 'UTC';
                    const targetTimezone = targetTimezoneSelect.value || 'UTC';
                    if (!targetTimezoneSelect.value) {
                        showToast('No target timezone selected. Defaulting to UTC.', 'warning');
                    }
                    console.log(`Using source timezone: ${sourceTimezone}, target timezone: ${targetTimezone}`);

                    // Check and update targetTimezone in settings
                    const settings = await loadFromStore('settings');
                    const settingsData = settings.find(s => s.id === 'settings') || { targetTimezone: 'UTC' };
                    if (settingsData.targetTimezone !== targetTimezone) {
                        settingsData.targetTimezone = targetTimezone;
                        await saveToStore('settings', settingsData);
                        console.log(`Updated targetTimezone in settings to ${targetTimezone}`);
                        showToast('Target timezone updated in settings.', 'success');
                    }

                    for (const record of result.data) {
                        rowIndex++;
                        if (!record[columnMapping.symbol] || !record[columnMapping.entry_datetime]) {
                            skippedRows.push({ row: rowIndex, reason: 'Missing required fields (symbol or entry_datetime)', record, symbol: record[columnMapping.symbol] || 'Unknown' });
                            console.warn(`Skipping row ${rowIndex}: Missing required fields`, record);
                            continue;
                        }

                        console.log('Processing trade record (CSV):', record);

                        const entryDatetime = record[columnMapping.entry_datetime];
                        const rawPosition = record[columnMapping.position] || '';
                        const normalizedPosition = rawPosition.toLowerCase().trim();
                        let position = POSITION_TYPE_MAPPINGS.buy.includes(normalizedPosition) ? 'buy' :
                                      POSITION_TYPE_MAPPINGS.sell.includes(normalizedPosition) ? 'sell' : '';

                        // Infer position from Profit/Loss if Outcome is Win/Loss
                        if (POSITION_TYPE_MAPPINGS.inferred.includes(normalizedPosition)) {
                            const rawProfit = record[columnMapping.profit] || '0';
                            const cleanedProfit = String(rawProfit)
                                .replace(/[^0-9.-]+/g, '')
                                .replace(/\(([^)]+)\)/, '-$1');
                            const profitLoss = !isNaN(parseFloat(cleanedProfit)) ? parseFloat(cleanedProfit) : 0;
                            position = profitLoss >= 0 ? 'buy' : 'sell';
                            console.log(`Inferred position for ${record[columnMapping.symbol]}: '${normalizedPosition}' -> '${position}' based on Profit/Loss: ${profitLoss}`);
                        }

                        if (!['buy', 'sell'].includes(position)) {
                            skippedRows.push({ row: rowIndex, reason: `Invalid position: ${rawPosition}`, record, symbol: record[columnMapping.symbol] || 'Unknown' });
                            console.warn(`Skipping row ${rowIndex}: Invalid position`, rawPosition, record);
                            continue;
                        }

                        const lotSize = parseFloat(record[columnMapping.lot]) || 1;
                        const pair = record[columnMapping.symbol].toUpperCase().replace('.CASH', '');
                        let entryPrice = parseFloat(record[columnMapping.entry_price]) || 0;
                        let slPrice = parseFloat(record[columnMapping.stop_loss]) || 0;
                        let takeProfit = parseFloat(record[columnMapping.take_profit]) || 0;
                        let exitPrice = parseFloat(record[columnMapping.exit_price]) || 0;
                        const commission = parseFloat(record[columnMapping.commission]) || 0;
                        const swap = parseFloat(record[columnMapping.swap]) || 0;
                        const exitDatetime = record[columnMapping.exit_datetime] || '';
                        const positionId = String(record[columnMapping.position_id] || record['Trade #'] || rowIndex); // Ensure string
                        console.log(`Position ID for row ${rowIndex}: ${positionId}`);

                        const rawProfit = record[columnMapping.profit] || '0';
                        const cleanedProfit = String(rawProfit)
                            .replace(/[^0-9.-]+/g, '')
                            .replace(/\(([^)]+)\)/, '-$1');
                        const profitLoss = !isNaN(parseFloat(cleanedProfit)) ? parseFloat(cleanedProfit) : 0;
                        const csvPips = columnMapping.pips ? record[columnMapping.pips] : undefined;

                        let pairRecord = existingPairs.find(p => p.name.toUpperCase() === pair);
                        let marketType;
                        if (!pairRecord) {
                            marketType = pair === 'SPX500' || pair === 'US30' || pair === 'NDX100' || pair === 'NAS100' || pair === 'US100' ? 'indices' : 
                                         (pair === 'XAUUSD' || pair === 'XAGUSD' ? 'commodities' : 'forex');
                            pairRecord = { id: Date.now(), name: pair, market_type: marketType };
                            await saveToStore('pairs', pairRecord);
                            existingPairs.push(pairRecord);
                            console.log('Created new pair:', pairRecord);
                        } else {
                            marketType = pairRecord.market_type || (pair === 'SPX500' || pair === 'US30' || pair === 'NDX100' || pair === 'NAS100' || pair === 'US100' ? 'indices' : 
                                                                    (pair === 'XAUUSD' || pair === 'XAGUSD' ? 'commodities' : 'forex'));
                            if (!pairRecord.market_type) {
                                pairRecord.market_type = marketType;
                                await saveToStore('pairs', pairRecord);
                                console.log('Updated pair with market_type:', pairRecord);
                            }
                            console.log('Found existing pair:', pairRecord);
                        }

                        if (!['indices', 'forex', 'commodities', 'crypto'].includes(marketType)) {
                            console.warn('Invalid market type for symbol:', pair, marketType);
                            skippedRows.push({ row: rowIndex, reason: `Invalid market type: ${marketType}`, record, symbol: pair });
                            continue;
                        }

                        // Parse and convert datetimes
                        let parsedEntryDatetime, parsedExitDatetime, dateStr, tradeTime, exitTime;
                        try {
                            console.log(`Parsing entry datetime: ${entryDatetime}`);
                            parsedEntryDatetime = moment.tz(entryDatetime, 'YYYY-MM-DD HH:mm:ss', sourceTimezone);
                            if (!parsedEntryDatetime.isValid()) {
                                console.warn(`Invalid entry datetime format: ${entryDatetime}`);
                                throw new Error('Invalid entry datetime');
                            }
                            const entryConverted = parsedEntryDatetime.tz(targetTimezone);
                            dateStr = entryConverted.format('YYYY-MM-DD');
                            tradeTime = entryConverted.format('HH:mm');

                            if (exitDatetime) {
                                parsedExitDatetime = moment.tz(exitDatetime, 'YYYY-MM-DD HH:mm:ss', sourceTimezone);
                                if (!parsedExitDatetime.isValid()) {
                                    console.warn(`Invalid exit datetime format: ${exitDatetime}`);
                                    throw new Error('Invalid exit datetime');
                                }
                                const exitConverted = parsedExitDatetime.tz(targetTimezone);
                                exitTime = exitConverted.format('HH:mm');
                            } else {
                                exitTime = '';
                            }
                        } catch (err) {
                            skippedRows.push({ row: rowIndex, reason: `Invalid datetime: ${entryDatetime} or ${exitDatetime}`, record, symbol: pair });
                            console.warn(`Skipping row ${rowIndex}: ${err.message}`, record);
                            continue;
                        }

                        const tradeKey = `${activeAccountId}-${dateStr}-${tradeTime}-${pair}-${position}-${positionId}`;
                        console.log(`Generated tradeKey: ${tradeKey}`);
                        console.log(`Checking tradeKey against existingKeys: ${existingKeys.has(tradeKey) ? 'Duplicate found' : 'Unique'}`);
                        if (existingKeys.has(tradeKey)) {
                            skippedRows.push({ row: rowIndex, reason: `Duplicate trade`, record, symbol: pair });
                            console.warn(`Skipping row ${rowIndex}: Duplicate trade`, tradeKey, 'Record:', record);
                            continue;
                        }

                        // Secondary duplicate check using key fields
                        const isDuplicate = existingTrades.some(trade => 
                            trade.accountId === parseInt(activeAccountId) &&
                            trade.date === dateStr &&
                            trade.tradeTime === tradeTime &&
                            trade.pair === pair &&
                            trade.position === position &&
                            trade.positionId === positionId
                        );
                        if (isDuplicate) {
                            skippedRows.push({ row: rowIndex, reason: `Duplicate trade (secondary check)`, record, symbol: pair });
                            console.warn(`Skipping row ${rowIndex}: Duplicate trade (secondary check)`, tradeKey, 'Record:', record);
                            continue;
                        }

                        const actualRisk = await calculateMarketRisk({ 
                            entry_price: entryPrice, 
                            stop_loss: slPrice, 
                            lot: lotSize, 
                            position, 
                            market_type: marketType, 
                            symbol: pair 
                        }, multipliers, baseCurrency);

                        const stopLossDistance = calculateStopLossDistance(entryPrice, slPrice, marketType, pair);
                        const holdTime = calculateHoldTime(entryDatetime, exitDatetime);
                        const pipValue = calculateCsvPipValue(entryPrice, exitPrice, position, marketType, pair, multipliers, csvPips);

                        const trade = {
                            id: Date.now() + rowIndex,
                            accountId: parseInt(activeAccountId),
                            date: dateStr,
                            tradeTime,
                            exitTime,
                            pair,
                            timeframe: 'H1',
                            entryPrice,
                            exitPrice,
                            slPrice,
                            lotSize,
                            stopLoss: Number.parseFloat(stopLossDistance.toFixed(2)),
                            takeProfit,
                            profitLoss,
                            commission,
                            swap,
                            pipValue,
                            outcome: normalizedPosition === 'win' ? 'Win' : normalizedPosition === 'loss' ? 'Loss' : (profitLoss > 0 ? 'Win' : profitLoss < 0 ? 'Loss' : 'Breakeven'),
                            actualRR: calculateActualRR({ entry_price: entryPrice, stop_loss: slPrice, exit_price: exitPrice, position, lot: lotSize, market_type: marketType, symbol: pair }, multipliers),
                            plannedRR: calculatePlannedRR({ entry_price: entryPrice, stop_loss: slPrice, take_profit: takeProfit, lot: lotSize, market_type: marketType, symbol: pair }, multipliers),
                            actualRisk,
                            plannedRisk: actualRisk,
                            balance: null,
                            holdTime,
                            tradeType: '',
                            strategy: record[columnMapping.strategy] || 'Default Strategy',
                            session: '',
                            adherence: null,
                            disciplineScore: null,
                            setupScore: null,
                            mood: '',
                            emotions: [],
                            mistakes: [],
                            customTags: record[columnMapping.tags] ? record[columnMapping.tags].split(',') : [],
                            notes: '',
                            exitReason: '',
                            outsideWindow: false,
                            screenshots: [],
                            positionId,
                            position,
                            market_type: marketType
                        };

                        console.log('Parsed trade (CSV):', trade);
                        parsedTrades.push(trade);
                        existingKeys.add(tradeKey);
                    }

                    // Update broker timezone if trades were parsed
                    if (parsedTrades.length > 0 && settingsData.activeAccountId) {
                        const accounts = await loadFromStore('accounts');
                        const activeAccount = accounts.find(a => a.id === parseInt(settingsData.activeAccountId));
                        if (activeAccount && activeAccount.brokerId) {
                            const brokers = await loadFromStore('brokers');
                            const broker = brokers.find(b => b.id === activeAccount.brokerId);
                            if (broker) {
                                broker.timezone = sourceTimezone;
                                await saveToStore('brokers', broker);
                                console.log(`Updated broker ${broker.name} timezone to ${sourceTimezone}`);
                                showToast('Broker timezone updated.', 'success');
                            } else {
                                console.warn(`No broker found for brokerId ${activeAccount.brokerId}`);
                            }
                        } else {
                            console.warn(`No active account or brokerId found for accountId ${settingsData.activeAccountId}`);
                        }
                    }

                    console.log('Existing keys after CSV parse:', Array.from(existingKeys));
                    if (parsedTrades.length === 0) {
                        console.error('No valid trades parsed. Skipped rows:', skippedRows);
                    }
                    displayPreview(parsedTrades, previewTable, previewSection, confirmButton, skippedRows, feedbackDiv, existingPairs);
                } catch (err) {
                    showToast('Error processing CSV data.', 'error');
                    console.error('CSV processing error:', err);
                }
            },
            error: (err) => {
                showToast('Error parsing CSV.', 'error');
                console.error('CSV parse error:', err);
            }
        });
    } catch (err) {
        showToast('Error reading CSV file.', 'error');
        console.error('CSV read error:', err);
    }
}

else if (fileType === 'mt5') {
    console.log('Entering MT5 parsing logic');
    const reader = new FileReader();
    reader.onload = async (event) => {
        let htmlData = event.target.result;
        // Check for UTF-16 encoding (BOM: FF FE)
        if (htmlData.charCodeAt(0) === 0xFEFF || htmlData.charCodeAt(0) === 0xFFFE) {
            console.log('Detected UTF-16 encoded MT5 file, converting to UTF-8');
            const buffer = await file.arrayBuffer();
            htmlData = new TextDecoder('utf-16le').decode(buffer);
        }
        console.log('MT5 HTML Data (first 500 chars):', htmlData.substring(0, 500));

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlData, 'text/html');
        const tables = doc.querySelectorAll('table');
        console.log('Number of tables found:', tables.length);

        const positionsTable = Array.from(tables).find(table => 
            table.textContent.toLowerCase().includes('positions') || 
            table.textContent.toLowerCase().includes('trade history')
        );

        if (!positionsTable) {
            showToast('No "Positions" table found in MT5 HTML.', 'error');
            console.error('No "Positions" or "Trade History" table found in MT5 HTML');
            return;
        }
        console.log('Positions table found:', positionsTable.outerHTML.substring(0, 200));

        const rows = positionsTable.querySelectorAll('tr');
        console.log('Total rows in table:', rows.length);

        let headers = [];
        let headerIndex = -1;
        const knownHeaders = ['time', 'position', 'symbol', 'type', 'volume', 'price', 's / l', 't / p', 'commission', 'swap', 'profit'];
        rows.forEach((row, i) => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 13) {
                const cellContents = Array.from(cells).map(cell => cell.textContent.trim().toLowerCase());
                const nonEmptyCells = cellContents.filter(content => content !== '').length;
                const hasKnownHeaders = knownHeaders.some(header => cellContents.includes(header));
                if (hasKnownHeaders && nonEmptyCells >= 5) {
                    headers = Array.from(cells).map(cell => cell.textContent.trim());
                    headerIndex = i;
                    return false; // Break the loop
                }
            }
        });

        console.log('MT5 Headers:', headers);
        if (headers.length === 0) {
            showToast('No valid headers found in MT5 HTML.', 'error');
            console.error('No "Positions" headers extracted (expected 13 columns)');
            return;
        }

        // Get timezone selections
        const sourceTimezone = sourceTimezoneSelect.value || 'UTC';
        const targetTimezone = targetTimezoneSelect.value || 'UTC';
        if (!targetTimezoneSelect.value) {
            showToast('No target timezone selected. Defaulting to UTC.', 'warning');
        }
        console.log(`Using source timezone: ${sourceTimezone}, target timezone: ${targetTimezone}`);

        // Check and update targetTimezone in settings
        const settings = await loadFromStore('settings');
        const settingsData = settings.find(s => s.id === 'settings') || { targetTimezone: 'UTC' };
        if (settingsData.targetTimezone !== targetTimezone) {
            settingsData.targetTimezone = targetTimezone;
            await saveToStore('settings', settingsData);
            console.log(`Updated targetTimezone in settings to ${targetTimezone}`);
            showToast('Target timezone updated in settings.', 'success');
        }

        for (let i = headerIndex + 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            console.log(`Row ${rowIndex + 1} cells length:`, cells.length);
            const rawCells = Array.from(cells).map(cell => cell.textContent.trim());
            console.log(`Raw cells for row ${rowIndex + 1}:`, rawCells);

            if (cells.length === 14) {
                const adjustedCells = [
                    cells[0].textContent.trim() || '',  // Time (Entry)
                    cells[1].textContent.trim() || '',  // Position ID
                    cells[2].textContent.trim() || '',  // Symbol
                    cells[3].textContent.trim() || '',  // Type (Position)
                    cells[4].textContent.trim() || '1', // Hidden (skip)
                    cells[5].textContent.trim() || '1', // Volume (lot)
                    cells[6].textContent.trim() || '0', // Price (Entry)
                    cells[7].textContent.trim() || '0', // S / L
                    cells[8].textContent.trim() || '0', // T / P
                    cells[9].textContent.trim() || '',  // Time (Exit)
                    cells[10].textContent.trim() || '0', // Price (Exit)
                    cells[11].textContent.trim() || '0', // Commission
                    cells[12].textContent.trim() || '0', // Swap
                    cells[13].textContent.trim() || '0'  // Profit
                ];

                console.log(`Row ${rowIndex + 1} adjusted cells:`, adjustedCells);

                rowIndex++;
                const entryDatetimeRaw = adjustedCells[0];
                const positionId = adjustedCells[1];
                const pair = adjustedCells[2].toUpperCase();
                const rawPosition = adjustedCells[3] || '';
                const normalizedPosition = rawPosition.toLowerCase().trim();
                const position = normalizedPosition === 'buy' ? 'buy' : normalizedPosition === 'sell' ? 'sell' : '';
                console.log(`Raw position for ${pair}: '${rawPosition}', Normalized: '${normalizedPosition}', Parsed: '${position}'`);
                if (!['buy', 'sell'].includes(position)) {
                    skippedRows.push({ row: rowIndex, reason: `Invalid position: ${rawPosition}`, record: adjustedCells, symbol: pair });
                    console.warn(`Skipping row ${rowIndex}: Invalid position`, rawPosition, adjustedCells);
                    continue;
                }
                const lotSize = parseFloat(adjustedCells[5]) || 1;
                let entryPrice = parseFloat(adjustedCells[6]) || 0;
                let slPrice = adjustedCells[7] === '' ? 0 : parseFloat(adjustedCells[7]) || 0;
                let takeProfit = adjustedCells[8] === '' ? 0 : parseFloat(adjustedCells[8]) || 0;
                let exitPrice = parseFloat(adjustedCells[10]) || 0;
                const commission = parseFloat(adjustedCells[11]) || 0;
                const swap = parseFloat(adjustedCells[12]) || 0;
                const exitDatetimeRaw = adjustedCells[9];
                const rawProfit = adjustedCells[13] || '0';
                console.log(`Raw profit for row ${rowIndex} (MT5):`, rawProfit);
                const cleanedProfit = String(rawProfit).replace(/\s/g, '');
                const profitLoss = !isNaN(parseFloat(cleanedProfit)) ? parseFloat(cleanedProfit) : 0;
                console.log(`Parsed profit for row ${rowIndex} (MT5):`, profitLoss);

                if (!entryDatetimeRaw || !position || !pair) {
                    skippedRows.push({ row: rowIndex, reason: `Missing or invalid required fields (position: ${rawPosition})`, record: adjustedCells, symbol: pair });
                    console.warn(`Skipping row ${rowIndex}: Missing or invalid required fields`, adjustedCells);
                    continue;
                }

                // Parse and convert datetimes
                let parsedEntryDatetime, parsedExitDatetime, dateStr, tradeTime, exitTime;
                try {
                    console.log(`Parsing entry datetime: ${entryDatetimeRaw}, exit datetime: ${exitDatetimeRaw}`);
                    parsedEntryDatetime = moment.tz(entryDatetimeRaw, 'YYYY.MM.DD HH:mm:ss', sourceTimezone);
                    if (!parsedEntryDatetime.isValid()) {
                        console.warn(`Invalid entry datetime format: ${entryDatetimeRaw}`);
                        throw new Error('Invalid entry datetime');
                    }
                    const entryConverted = parsedEntryDatetime.tz(targetTimezone);
                    dateStr = entryConverted.format('YYYY-MM-DD');
                    tradeTime = entryConverted.format('HH:mm');

                    if (exitDatetimeRaw) {
                        parsedExitDatetime = moment.tz(exitDatetimeRaw, 'YYYY.MM.DD HH:mm:ss', sourceTimezone);
                        if (!parsedExitDatetime.isValid()) {
                            console.warn(`Invalid exit datetime format: ${exitDatetimeRaw}`);
                            throw new Error('Invalid exit datetime');
                        }
                        const exitConverted = parsedExitDatetime.tz(targetTimezone);
                        exitTime = exitConverted.format('HH:mm');
                    } else {
                        exitTime = '';
                    }
                } catch (err) {
                    skippedRows.push({ row: rowIndex, reason: `Invalid datetime: ${entryDatetimeRaw} or ${exitDatetimeRaw}`, record: adjustedCells, symbol: pair });
                    console.warn(`Skipping row ${rowIndex}: ${err.message}`, adjustedCells);
                    continue;
                }

                let pairRecord = existingPairs.find(p => p.name.toUpperCase() === pair);
                let marketType;
                if (!pairRecord) {
                    marketType = pair === 'SPX500' || pair === 'US30' || pair === 'NDX100' || pair === 'NAS100' ? 'indices' : 
                                 (pair === 'XAUUSD' || pair === 'XAGUSD' ? 'commodities' : 'forex');
                    pairRecord = { id: Date.now(), name: pair, market_type: marketType };
                    await saveToStore('pairs', pairRecord);
                    existingPairs.push(pairRecord);
                    console.log('Created new pair:', pairRecord);
                } else {
                    marketType = pairRecord.market_type || (pair === 'SPX500' || pair === 'US30' || pair === 'NDX100' || pair === 'NAS100' ? 'indices' : 
                                                            (pair === 'XAUUSD' || pair === 'XAGUSD' ? 'commodities' : 'forex'));
                    if (!pairRecord.market_type) {
                        pairRecord.market_type = marketType;
                        await saveToStore('pairs', pairRecord);
                        console.log('Updated pair with market_type:', pairRecord);
                    }
                    console.log('Found existing pair:', pairRecord);
                }

                if (!['indices', 'forex', 'commodities', 'crypto'].includes(marketType)) {
                    console.warn('Invalid market type for symbol:', pair, marketType);
                    skippedRows.push({ row: rowIndex, reason: `Invalid market type: ${marketType}`, record: adjustedCells, symbol: pair });
                    continue;
                }

                entryPrice = entryPrice || 0;
                slPrice = slPrice || 0;
                takeProfit = takeProfit || 0;
                exitPrice = exitPrice || 0;

                const tradeKey = `${activeAccountId}-${dateStr}-${tradeTime}-${pair}-${position}-${positionId}`;
                if (existingKeys.has(tradeKey)) {
                    skippedRows.push({ row: rowIndex, reason: `Duplicate trade (key: ${tradeKey})`, record: adjustedCells, symbol: pair });
                    console.warn(`Skipping row ${rowIndex} for account ${activeAccountId}: Duplicate trade`, tradeKey);
                    console.log('Skipped row:', skippedRows[skippedRows.length - 1]);
                    continue;
                }

                const actualRisk = await calculateMarketRisk({ 
                    entry_price: entryPrice, 
                    stop_loss: slPrice, 
                    lot: lotSize, 
                    position, 
                    market_type: marketType, 
                    symbol: pair 
                }, multipliers, baseCurrency);

                const stopLossDistance = calculateStopLossDistance(entryPrice, slPrice, marketType, pair);
                const holdTime = calculateHoldTime(parsedEntryDatetime.format('DD/MM/YYYY HH:mm:ss'), parsedExitDatetime ? parsedExitDatetime.format('DD/MM/YYYY HH:mm:ss') : '');
                const pipValue = calculatePipValue(entryPrice, exitPrice, position, marketType, pair, multipliers);

                const trade = {
                    id: Date.now() + rowIndex,
                    accountId: parseInt(activeAccountId),
                    date: dateStr,
                    tradeTime,
                    exitTime,
                    pair,
                    timeframe: 'H1',
                    entryPrice,
                    exitPrice,
                    slPrice,
                    lotSize,
                    stopLoss: Number.parseFloat(stopLossDistance.toFixed(2)),
                    takeProfit,
                    profitLoss,
                    commission,
                    swap,
                    pipValue,
                    outcome: profitLoss > 0 ? 'Win' : profitLoss < 0 ? 'Loss' : 'Breakeven',
                    actualRR: calculateActualRR({ entry_price: entryPrice, stop_loss: slPrice, exit_price: exitPrice, position, lot: lotSize, market_type: marketType, symbol: pair }, multipliers),
                    plannedRR: calculatePlannedRR({ entry_price: entryPrice, stop_loss: slPrice, take_profit: takeProfit, lot: lotSize, market_type: marketType, symbol: pair }, multipliers),
                    actualRisk,
                    plannedRisk: actualRisk,
                    balance: null,
                    holdTime,
                    tradeType: '',
                    strategy: '',
                    session: '',
                    adherence: null,
                    disciplineScore: null,
                    setupScore: null,
                    mood: '',
                    emotions: [],
                    mistakes: [],
                    customTags: [],
                    notes: '',
                    exitReason: '',
                    outsideWindow: false,
                    screenshots: [],
                    positionId,
                    position,
                    market_type: marketType
                };

                console.log('Parsed trade (MT5):', trade);
                parsedTrades.push(trade);
                existingKeys.add(tradeKey);
            }
            // Break if we hit a header row like "Open Time"
            if (cells.length === 11 && cells[0].textContent.trim().toLowerCase() === 'open time') {
                console.log(`Breaking at row ${rowIndex + 1} due to 'open time' header`);
                break;
            }
        }

        // Update broker timezone if trades were parsed
        if (parsedTrades.length > 0 && settingsData.activeAccountId) {
            const accounts = await loadFromStore('accounts');
            const activeAccount = accounts.find(a => a.id === parseInt(settingsData.activeAccountId));
            if (activeAccount && activeAccount.brokerId) {
                const brokers = await loadFromStore('brokers');
                const broker = brokers.find(b => b.id === activeAccount.brokerId);
                if (broker) {
                    broker.timezone = sourceTimezone;
                    await saveToStore('brokers', broker);
                    console.log(`Updated broker ${broker.name} timezone to ${sourceTimezone}`);
                    showToast('Broker timezone updated.', 'success');
                } else {
                    console.warn(`No broker found for brokerId ${activeAccount.brokerId}`);
                }
            } else {
                console.warn(`No active account or brokerId found for accountId ${settingsData.activeAccountId}`);
            }
        }

        displayPreview(parsedTrades, previewTable, previewSection, confirmButton, skippedRows, feedbackDiv, existingPairs);
    };
    reader.onerror = () => {
        showToast('Error reading MT5 file.', 'error');
        console.error('FileReader error:', reader.error);
    };
    reader.readAsText(file);
    return;
}

              else if (fileType === 'ctrader') {
    console.log('Entering cTrader parsing logic');
    const reader = new FileReader();
    reader.onload = async (event) => {
        let htmlData = event.target.result;
        // Handle UTF-16 encoding
        if (htmlData.charCodeAt(0) === 0xFEFF || htmlData.charCodeAt(0) === 0xFFFE) {
            console.log('Detected UTF-16 encoded cTrader file, converting to UTF-8');
            const buffer = await file.arrayBuffer();
            htmlData = new TextDecoder('utf-16le').decode(buffer);
        }
        console.log('cTrader HTML Data (first 500 chars):', htmlData.substring(0, 500));

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlData, 'text/html');
        const tables = doc.querySelectorAll('table.dataTable');
        console.log('Number of tables found:', tables.length);

        const historyTable = Array.from(tables).find(table => 
            table.querySelector('td.title-style')?.textContent.trim().toLowerCase() === 'history' ||
            table.textContent.toLowerCase().includes('order id') ||
            table.textContent.toLowerCase().includes('opening time')
        );

        if (!historyTable) {
            showToast('No "History" table found in cTrader HTML.', 'error');
            console.error('No "History" table found. Available table titles:', 
                Array.from(tables).map(t => t.querySelector('td.title-style')?.textContent.trim()));
            return;
        }
        console.log('History table found:', historyTable.outerHTML.substring(0, 200));

        const rows = historyTable.querySelectorAll('tr');
        console.log('Total rows in table:', rows.length);

        // Find header row
        let headers = [];
        let headerIndex = -1;
        rows.forEach((row, i) => {
            const cells = row.querySelectorAll('td.cell-header');
            if (cells.length > 0) {
                headers = Array.from(cells).map(cell => cell.textContent.trim());
                console.log('cTrader Headers (raw):', headers);
                console.log('cTrader Headers (normalized):', headers.map(h => h.toLowerCase().trim()));
                headerIndex = i;
                return false; // Break the loop
            }
        });

        if (headers.length === 0) {
            showToast('No valid headers found in cTrader HTML.', 'error');
            console.error('No valid headers extracted from cTrader HTML');
            return;
        }

        // Map headers to fields with fuzzy matching
        const headerMapping = {};
        const fuzzyThreshold = 80; // Minimum similarity score for a match
        headers.forEach((header, index) => {
            const normalizedHeader = header.toLowerCase().trim();
            for (const [field, possibleHeaders] of Object.entries(CTRADER_COLUMN_MAPPINGS)) {
                if (headerMapping[field]) continue; // Skip if already mapped
                const bestMatch = possibleHeaders.reduce((best, ph) => {
                    const score = fuzzyMatch(ph, header);
                    return score > best.score ? { header: ph, score } : best;
                }, { header: '', score: 0 });
                if (bestMatch.score >= fuzzyThreshold) {
                    headerMapping[field] = index;
                    console.log(`Mapped "${header}" to "${field}" (matched "${bestMatch.header}", score: ${bestMatch.score})`);
                }
            }
        });

        console.log('cTrader Header Mapping:', headerMapping);

        // Check for required fields
        const requiredFields = ['entry_datetime', 'position', 'symbol'];
        const missingFields = requiredFields.filter(field => headerMapping[field] === undefined);
        if (missingFields.length > 0) {
            console.warn('Missing required columns:', missingFields, 'Available headers:', headers);
            // Display manual mapping UI
            columnMappingsDiv.innerHTML = '<p>Missing required columns. Please map the following fields:</p>';
            missingFields.forEach(field => {
                const div = document.createElement('div');
                div.className = 'mb-2';
                div.innerHTML = `
                    <label for="map-${field}">${field.replace('_', ' ')}:</label>
                    <select id="map-${field}" class="form-control">
                        <option value="">Select column</option>
                        ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
                    </select>
                `;
                columnMappingsDiv.appendChild(div);
            });
            columnMappingSection.style.display = 'block';
            // Add a button to apply manual mappings
            const applyButton = document.createElement('button');
            applyButton.type = 'button';
            applyButton.className = 'btn btn-primary mt-2';
            applyButton.textContent = 'Apply Mappings';
            applyButton.addEventListener('click', async () => {
                missingFields.forEach(field => {
                    const select = document.getElementById(`map-${field}`);
                    const selectedHeader = select.value;
                    if (selectedHeader) {
                        const index = headers.indexOf(selectedHeader);
                        if (index !== -1) {
                            headerMapping[field] = index;
                            console.log(`Manually mapped "${selectedHeader}" to "${field}"`);
                        }
                    }
                });
                if (requiredFields.every(field => headerMapping[field] !== undefined)) {
                    columnMappingSection.style.display = 'none';
                    await continueParsing();
                } else {
                    showToast('Please map all required fields.', 'error');
                }
            });
            columnMappingsDiv.appendChild(applyButton);
            showToast(`Please map missing columns: ${missingFields.join(', ')}. Available headers: ${headers.join(', ')}`, 'warning');
            return;
        }

        // Continue parsing after manual mapping (if needed)
        async function continueParsing() {
            const totalRows = rows.length - (headerIndex + 1);
            let processedRows = 0;
            const orderIdsSeen = new Set(
                existingTrades
                    .filter(t => t.accountId === parseInt(activeAccountId))
                    .map(t => t.positionId)
                    .filter(id => id)
            );
            const profitLogs = [];

            for (let i = headerIndex + 1; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                const isTotalsRow = cells[0]?.classList.contains('totals-title');
                if (isTotalsRow) {
                    console.log(`Skipping totals row at index ${i}`);
                    processedRows++;
                    continue;
                }
                const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                if (cells.length !== headers.length || cellTexts.every(text => text === '')) {
                    console.log(`Skipping non-data row ${rowIndex + 1}: cells=${cells.length}, headers=${headers.length}`);
                    processedRows++;
                    continue;
                }

                processedRows++;
                const progress = Math.round((processedRows / totalRows) * 100);
                feedbackDiv.innerHTML = `<div class="alert alert-info">Parsing cTrader file: ${progress}% complete...</div>`;

                console.log(`Row ${rowIndex + 1} cells length:`, cells.length);
                const rawCells = Array.from(cells).map(cell => cell.textContent.trim());
                console.log(`Raw cells for row ${rowIndex + 1}:`, rawCells);

                rowIndex++;
                const entryDatetime = headerMapping.entry_datetime !== undefined ? rawCells[headerMapping.entry_datetime] || '' : '';
                const positionId = headerMapping.position_id !== undefined ? rawCells[headerMapping.position_id] || '' : '';
                const pair = headerMapping.symbol !== undefined ? (rawCells[headerMapping.symbol] || '').toUpperCase() : '';
                const rawPosition = headerMapping.position !== undefined ? rawCells[headerMapping.position] || '' : '';
                const normalizedPosition = rawPosition.toLowerCase().trim();
                const position = POSITION_TYPE_MAPPINGS.buy.includes(normalizedPosition) ? 'buy' :
                                POSITION_TYPE_MAPPINGS.sell.includes(normalizedPosition) ? 'sell' : '';
                console.log(`Raw position for ${pair}: '${rawPosition}', Normalized: '${normalizedPosition}', Parsed: '${position}'`);
                if (!['buy', 'sell'].includes(position)) {
                    console.warn(`Unrecognized position type: ${rawPosition}`);
                    skippedRows.push({ row: rowIndex, reason: `Invalid position: ${rawPosition}`, record: rawCells, symbol: pair });
                    continue;
                }
                const rawLot = headerMapping.lot !== undefined ? rawCells[headerMapping.lot] || '1' : '1';
                const lotSize = parseFloat(rawLot.replace(/[^0-9.]/g, '')) || 1;
                let entryPrice = headerMapping.entry_price !== undefined ? parseFloat(rawCells[headerMapping.entry_price]) || 0 : 0;
                let slPrice = 0; // cTrader does not provide SL
                let takeProfit = 0; // cTrader does not provide TP
                let exitPrice = headerMapping.exit_price !== undefined ? parseFloat(rawCells[headerMapping.exit_price]) || 0 : 0;
                const commission = headerMapping.commission !== undefined ? parseFloat(rawCells[headerMapping.commission]) || 0 : 0;
                const swap = headerMapping.swap !== undefined ? parseFloat(rawCells[headerMapping.swap]) || 0 : 0;
                const exitDatetime = headerMapping.exit_datetime !== undefined ? rawCells[headerMapping.exit_datetime] || '' : '';
                const rawProfit = headerMapping.profit !== undefined ? rawCells[headerMapping.profit] || '0' : '0';
                const cleanedProfit = String(rawProfit).replace(/[^0-9.-]/g, '');
                const profitLoss = !isNaN(parseFloat(cleanedProfit)) ? parseFloat(cleanedProfit) : 0;
                profitLogs.push({
                    row: rowIndex,
                    positionId,
                    rawProfit,
                    parsedProfit: profitLoss,
                    warning: rawProfit && isNaN(parseFloat(cleanedProfit)) ? `Invalid profit parsing: raw=${rawProfit}, cleaned=${cleanedProfit}` : null
                });

                if (!entryDatetime || !position || !pair) {
                    skippedRows.push({ row: rowIndex, reason: `Missing required fields (datetime: ${entryDatetime}, position: ${normalizedPosition}, symbol: ${pair})`, record: rawCells, symbol: pair });
                    console.warn(`Skipping row ${rowIndex}: Missing required fields`, rawCells);
                    continue;
                }

                if (positionId && orderIdsSeen.has(positionId)) {
                    skippedRows.push({ row: rowIndex, reason: `Duplicate Order ID: ${positionId}`, record: rawCells, symbol: pair });
                    console.warn(`Skipping row ${rowIndex}: Duplicate Order ID`, positionId);
                    continue;
                }
                if (positionId) orderIdsSeen.add(positionId);

                // Parse cTrader datetime with flexible format
                let parsedEntryDatetime;
                try {
                    // Try DD/MM/YYYY HH:MM:SS.sss
                    let [datePart, timePart] = entryDatetime.split(' ');
                    if (datePart.includes('/')) {
                        const [day, month, year] = datePart.split('/').map(Number);
                        const [hours, minutes, seconds] = timePart.split(':').map(s => Number(s.split('.')[0]));
                        parsedEntryDatetime = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
                    } else if (datePart.includes('-')) {
                        // Try YYYY-MM-DD HH:MM:SS
                        parsedEntryDatetime = new Date(entryDatetime + ' UTC');
                    } else {
                        throw new Error('Unsupported date format');
                    }
                    if (isNaN(parsedEntryDatetime)) throw new Error('Invalid date');
                } catch (err) {
                    skippedRows.push({ row: rowIndex, reason: `Invalid entry datetime: ${entryDatetime}`, record: rawCells, symbol: pair });
                    console.warn(`Skipping row ${rowIndex}: Invalid entry datetime`, entryDatetime, err);
                    continue;
                }

                let pairRecord = existingPairs.find(p => p.name.toUpperCase() === pair);
                let marketType;
                if (!pairRecord) {
                    marketType = pair === 'SPX500' || pair === 'US30' || pair === 'NDX100' || pair === 'NAS100' ? 'indices' : 
                                 (pair === 'XAUUSD' || pair === 'XAGUSD' ? 'commodities' : 'forex');
                    pairRecord = { id: Date.now(), name: pair, market_type: marketType };
                    await saveToStore('pairs', pairRecord);
                    existingPairs.push(pairRecord);
                    console.log('Created new pair:', pairRecord);
                } else {
                    marketType = pairRecord.market_type || (pair === 'SPX500' || pair === 'US30' || pair === 'NDX100' || pair === 'NAS100' ? 'indices' : 
                                                            (pair === 'XAUUSD' || pair === 'XAGUSD' ? 'commodities' : 'forex'));
                    if (!pairRecord.market_type) {
                        pairRecord.market_type = marketType;
                        await saveToStore('pairs', pairRecord);
                        console.log('Updated pair with market_type:', pairRecord);
                    }
                    console.log('Found existing pair:', pairRecord);
                }

                if (!['indices', 'forex', 'crypto', 'commodities'].includes(marketType)) {
                    console.warn('Invalid market type for symbol:', pair, marketType);
                    skippedRows.push({ row: rowIndex, reason: `Invalid market type: ${marketType}`, record: rawCells, symbol: pair });
                    continue;
                }

                entryPrice = entryPrice || 0;
                slPrice = slPrice || 0;
                takeProfit = takeProfit || 0;
                exitPrice = exitPrice || 0;

                const dateStr = parsedEntryDatetime.toISOString().split('T')[0];
                const tradeTime = parsedEntryDatetime.toISOString().split('T')[1].slice(0, 5);
                const tradeKey = `${activeAccountId}-${dateStr}-${tradeTime}-${pair}-${position}-${positionId}`;
                if (existingKeys.has(tradeKey)) {
                    skippedRows.push({ row: rowIndex, reason: `Duplicate trade (key: ${tradeKey})`, record: rawCells, symbol: pair });
                    console.warn(`Skipping row ${rowIndex} for account ${activeAccountId}: Duplicate trade`, tradeKey);
                    continue;
                }

                const actualRisk = await calculateMarketRisk({ 
                    entry_price: entryPrice, 
                    stop_loss: slPrice, 
                    lot: lotSize, 
                    position, 
                    market_type: marketType, 
                    symbol: pair 
                }, multipliers, baseCurrency);

                const stopLossDistance = calculateStopLossDistance(entryPrice, slPrice, marketType, pair);
                const holdTime = calculateHoldTime(entryDatetime, exitDatetime);
                const pipValue = calculatePipValue(entryPrice, exitPrice, position, marketType, pair, multipliers);

                const trade = {
                    id: Date.now() + rowIndex,
                    accountId: parseInt(activeAccountId),
                    date: dateStr,
                    tradeTime: parsedEntryDatetime.toISOString().split('T')[1].slice(0, 5),
                    exitTime: exitDatetime ? new Date(parsedEntryDatetime.getTime() + holdTime * 60 * 1000).toISOString().split('T')[1].slice(0, 5) : '',
                    pair,
                    timeframe: 'H1',
                    entryPrice,
                    exitPrice,
                    slPrice,
                    lotSize,
                    stopLoss: Number.parseFloat(stopLossDistance.toFixed(2)),
                    takeProfit,
                    profitLoss,
                    commission,
                    swap,
                    pipValue,
                    outcome: profitLoss > 0 ? 'Win' : profitLoss < 0 ? 'Loss' : 'Breakeven',
                    actualRR: calculateActualRR({ entry_price: entryPrice, stop_loss: slPrice, exit_price: exitPrice, position, lot: lotSize, market_type: marketType, symbol: pair }, multipliers),
                    plannedRR: calculatePlannedRR({ entry_price: entryPrice, stop_loss: slPrice, take_profit: takeProfit, lot: lotSize, market_type: marketType, symbol: pair }, multipliers),
                    actualRisk,
                    plannedRisk: actualRisk,
                    balance: null,
                    holdTime,
                    tradeType: '',
                    strategy: '',
                    session: '',
                    adherence: null,
                    disciplineScore: null,
                    setupScore: null,
                    mood: '',
                    emotions: [],
                    mistakes: [],
                    customTags: [],
                    notes: '',
                    exitReason: '',
                    outsideWindow: false,
                    screenshots: [],
                    positionId,
                    position,
                    market_type: marketType
                };

                console.log('Parsed trade (cTrader):', trade);
                parsedTrades.push(trade);
                existingKeys.add(tradeKey);
            }

            feedbackDiv.innerHTML = '';
            displayPreview(parsedTrades, previewTable, previewSection, confirmButton, skippedRows, feedbackDiv, existingPairs);

            console.log('=== cTrader Import Summary ===');
            console.log('Profit Parsing Logs:', profitLogs);
            console.log('Parsed profitLoss summary:', parsedTrades.map(t => ({
                positionId: t.positionId,
                profitLoss: t.profitLoss
            })));
            console.log('Final parsed trades count:', parsedTrades.length);
            console.log('Skipped rows:', skippedRows);
            console.log('=============================');
        }

        // Trigger initial parsing
        await continueParsing();
    };
    reader.onerror = () => {
        showToast('Error reading cTrader file.', 'error');
        console.error('FileReader error:', reader.error);
    };
    reader.readAsText(file);
    return;
}

            } catch (err) {
                showToast('Error parsing file.', 'error');
                console.error('Parse error:', err);
                feedbackDiv.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
            }
        });

        // Handle confirm import
        confirmButton.addEventListener('click', async () => {
            feedbackDiv.innerHTML = '';
            try {
                for (const trade of parsedTrades) {
                    console.log('Saving trade to database:', trade);
                    await saveToStore('trades', trade);
                }
                feedbackDiv.innerHTML = `<div class="alert alert-success">Imported ${parsedTrades.length} trades successfully.</div>`;
                showToast(`Imported ${parsedTrades.length} trades.`, 'success');
                setTimeout(() => {
                    // Hide the modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('importTradesModal'));
                    if (modal) {
                        modal.hide();
                    }
                    // Refresh the page
                    window.location.reload();
                }, 500);
            } catch (err) {
                showToast('Error saving trades.', 'error');
                console.error('Save error:', err);
                feedbackDiv.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
            }
        });

      // Display preview table
function displayPreview(trades, tableBody, previewSection, confirmButton, skippedRows, feedbackDiv, existingPairs) {
    console.log('Displaying preview with', trades.length, 'trades');
    console.log('Existing pairs:', existingPairs);
    console.log('Skipped rows:', skippedRows);
    
    tableBody.innerHTML = '';

    if (trades.length === 0) {
        feedbackDiv.innerHTML = `<div class="alert alert-warning">No valid trades found. ${skippedRows.length ? 'Check skipped rows below.' : ''}</div>`;
        
        if (skippedRows.length) {
            const skippedContainer = document.createElement('div');
            skippedContainer.classList.add('mt-2');

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'btn btn-sm btn-outline-danger mb-2';
            toggleBtn.textContent = 'Show Skipped Rows';
            toggleBtn.setAttribute('data-expanded', 'false');

            const skippedList = document.createElement('div');
            skippedList.style.display = 'none';

            skippedRows.forEach(r => {
                const recordDiv = document.createElement('div');
                recordDiv.className = 'border rounded p-2 mb-2 bg-light';

                const title = document.createElement('strong');
                title.textContent = `Row ${r.row} – ${r.reason}`;
                recordDiv.appendChild(title);

                const symbol = document.createElement('div');
                symbol.innerHTML = `<strong>Symbol:</strong> ${r.symbol || '-'}`;
                recordDiv.appendChild(symbol);

                const rawData = document.createElement('pre');
                rawData.className = 'bg-white border mt-1 p-2';
                rawData.textContent = JSON.stringify(r.record, null, 2);
                recordDiv.appendChild(rawData);

                skippedList.appendChild(recordDiv);
            });

            toggleBtn.addEventListener('click', () => {
                const expanded = toggleBtn.getAttribute('data-expanded') === 'true';
                skippedList.style.display = expanded ? 'none' : 'block';
                toggleBtn.textContent = expanded ? 'Show Skipped Rows' : 'Hide Skipped Rows';
                toggleBtn.setAttribute('data-expanded', !expanded);
            });

            skippedContainer.appendChild(toggleBtn);
            skippedContainer.appendChild(skippedList);
            feedbackDiv.appendChild(skippedContainer);
        }

        return;
    }

    // Render valid trades
    trades.forEach(trade => {
        const row = document.createElement('tr');
        const marketType = trade.market_type || 'indices';
        const priceDecimals = marketType === 'forex' ? 5 : 2;
        const takeProfitDisplay = trade.takeProfit === 0 ? '0.0000' : trade.takeProfit.toFixed(priceDecimals);
        const slPriceDisplay = trade.slPrice === 0 ? '0.0000' : trade.slPrice.toFixed(priceDecimals);
        const entryPriceDisplay = trade.entryPrice === 0 ? '0.0000' : trade.entryPrice.toFixed(priceDecimals);
        const exitPriceDisplay = trade.exitPrice === 0 ? '0.0000' : trade.exitPrice.toFixed(priceDecimals);
        const profitLossDisplay = Number.parseFloat(trade.profitLoss.toFixed(2));
        const pipValueDisplay = trade.pipValue !== null && trade.pipValue !== undefined ? trade.pipValue.toFixed(1) : '-';

        row.innerHTML = `
            <td>${trade.accountId || '-'}</td>
            <td>${trade.date || '-'}</td>
            <td>${trade.tradeTime || '-'}</td>
            <td>${trade.exitTime || '-'}</td>
            <td>${trade.pair || '-'}</td>
            <td>${trade.position || '-'}</td>
            <td>${trade.lotSize || '-'}</td>
            <td>${entryPriceDisplay || '-'}</td>
            <td>${slPriceDisplay || '-'}</td>
            <td>${takeProfitDisplay || '-'}</td>
            <td>${exitPriceDisplay || '-'}</td>
            <td>${trade.commission === 0 ? '0.00' : trade.commission.toFixed(2) || '-'}</td>
            <td>${trade.swap === 0 ? '0.00' : trade.swap.toFixed(2) || '-'}</td>
            <td>${profitLossDisplay || '-'}</td>
            <td>${trade.actualRisk || '-'}</td>
            <td>${trade.actualRisk || '-'}</td> <!-- Net Risk: Reusing actualRisk as per table -->
            <td>${trade.plannedRR || '-'}</td>
            <td>${trade.actualRR || '-'}</td>
            <td>${trade.outcome || '-'}</td>
            <td>${trade.timeframe || 'Unknown'}</td>
            <td>${trade.positionId || '-'}</td>
            <td>${pipValueDisplay}</td>
        `;
        tableBody.appendChild(row);
    });

    previewSection.style.display = 'block';
    confirmButton.style.display = 'inline-block';
    feedbackDiv.innerHTML = `<div class="alert alert-info">Parsed ${trades.length} trades. Review the preview above and click "Confirm Import" to save.</div>`;

    if (skippedRows.length) {
        const skippedContainer = document.createElement('div');
        skippedContainer.classList.add('mt-2');

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn btn-sm btn-outline-danger mb-2';
        toggleBtn.textContent = 'Show Skipped Rows';
        toggleBtn.setAttribute('data-expanded', 'false');

        const skippedList = document.createElement('div');
        skippedList.style.display = 'none';

        skippedRows.forEach(r => {
            const recordDiv = document.createElement('div');
            recordDiv.className = 'border rounded p-2 mb-2 bg-light';

            const title = document.createElement('strong');
            title.textContent = `Row ${r.row} – ${r.reason}`;
            recordDiv.appendChild(title);

            const symbol = document.createElement('div');
            symbol.innerHTML = `<strong>Symbol:</strong> ${r.symbol || '-'}`;
            recordDiv.appendChild(symbol);

            const rawData = document.createElement('pre');
            rawData.className = 'bg-white border mt-1 p-2';
            rawData.textContent = JSON.stringify(r.record, null, 2);
            recordDiv.appendChild(rawData);

            skippedList.appendChild(recordDiv);
        });

        toggleBtn.addEventListener('click', () => {
            const expanded = toggleBtn.getAttribute('data-expanded') === 'true';
            skippedList.style.display = expanded ? 'none' : 'block';
            toggleBtn.textContent = expanded ? 'Show Skipped Rows' : 'Hide Skipped Rows';
            toggleBtn.setAttribute('data-expanded', !expanded);
        });

        skippedContainer.appendChild(toggleBtn);
        skippedContainer.appendChild(skippedList);
        feedbackDiv.appendChild(skippedContainer);
    }

    console.log('Preview table rendered');
}

    } catch (err) {
        showToast('Error initializing import modal: ' + err.message, 'error');
        console.error('Modal init error:', err);
    }
}

