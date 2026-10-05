export interface Airport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
}

export const AIRPORTS: Airport[] = [
  // United States - Major
  { icao: 'KJFK', iata: 'JFK', name: 'John F. Kennedy International', city: 'New York', country: 'US' },
  { icao: 'KLGA', iata: 'LGA', name: 'LaGuardia', city: 'New York', country: 'US' },
  { icao: 'KEWR', iata: 'EWR', name: 'Newark Liberty International', city: 'Newark', country: 'US' },
  { icao: 'KTEB', iata: 'TEB', name: 'Teterboro', city: 'Teterboro', country: 'US' },
  { icao: 'KHPN', iata: 'HPN', name: 'Westchester County', city: 'White Plains', country: 'US' },
  { icao: 'KFRG', iata: 'FRG', name: 'Republic', city: 'Farmingdale', country: 'US' },
  { icao: 'KLAX', iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'US' },
  { icao: 'KVNY', iata: 'VNY', name: 'Van Nuys', city: 'Van Nuys', country: 'US' },
  { icao: 'KSMO', iata: 'SMO', name: 'Santa Monica Municipal', city: 'Santa Monica', country: 'US' },
  { icao: 'KBUR', iata: 'BUR', name: 'Hollywood Burbank', city: 'Burbank', country: 'US' },
  { icao: 'KSNA', iata: 'SNA', name: 'John Wayne / Orange County', city: 'Santa Ana', country: 'US' },
  { icao: 'KORD', iata: 'ORD', name: "O'Hare International", city: 'Chicago', country: 'US' },
  { icao: 'KMDW', iata: 'MDW', name: 'Midway International', city: 'Chicago', country: 'US' },
  { icao: 'KPWK', iata: 'PWK', name: 'Chicago Executive', city: 'Wheeling', country: 'US' },
  { icao: 'KDPA', iata: 'DPA', name: 'DuPage', city: 'West Chicago', country: 'US' },
  { icao: 'KATL', iata: 'ATL', name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', country: 'US' },
  { icao: 'KPDK', iata: 'PDK', name: 'DeKalb-Peachtree', city: 'Atlanta', country: 'US' },
  { icao: 'KDFW', iata: 'DFW', name: 'Dallas/Fort Worth International', city: 'Dallas', country: 'US' },
  { icao: 'KDAL', iata: 'DAL', name: 'Dallas Love Field', city: 'Dallas', country: 'US' },
  { icao: 'KADS', iata: 'ADS', name: 'Addison', city: 'Addison', country: 'US' },
  { icao: 'KDEN', iata: 'DEN', name: 'Denver International', city: 'Denver', country: 'US' },
  { icao: 'KAPA', iata: 'APA', name: 'Centennial', city: 'Englewood', country: 'US' },
  { icao: 'KSFB', iata: 'SFB', name: 'Orlando Sanford International', city: 'Sanford', country: 'US' },
  { icao: 'KSFO', iata: 'SFO', name: 'San Francisco International', city: 'San Francisco', country: 'US' },
  { icao: 'KOAK', iata: 'OAK', name: 'Oakland International', city: 'Oakland', country: 'US' },
  { icao: 'KSJC', iata: 'SJC', name: 'San Jose International', city: 'San Jose', country: 'US' },
  { icao: 'KPAO', iata: 'PAO', name: 'Palo Alto', city: 'Palo Alto', country: 'US' },
  { icao: 'KSEA', iata: 'SEA', name: 'Seattle-Tacoma International', city: 'Seattle', country: 'US' },
  { icao: 'KBFI', iata: 'BFI', name: 'Boeing Field / King County', city: 'Seattle', country: 'US' },
  { icao: 'KMIA', iata: 'MIA', name: 'Miami International', city: 'Miami', country: 'US' },
  { icao: 'KOPF', iata: 'OPF', name: 'Miami-Opa Locka Executive', city: 'Miami', country: 'US' },
  { icao: 'KFXE', iata: 'FXE', name: 'Fort Lauderdale Executive', city: 'Fort Lauderdale', country: 'US' },
  { icao: 'KFLL', iata: 'FLL', name: 'Fort Lauderdale-Hollywood International', city: 'Fort Lauderdale', country: 'US' },
  { icao: 'KPBI', iata: 'PBI', name: 'Palm Beach International', city: 'West Palm Beach', country: 'US' },
  { icao: 'KBCT', iata: 'BCT', name: 'Boca Raton', city: 'Boca Raton', country: 'US' },
  { icao: 'KMCO', iata: 'MCO', name: 'Orlando International', city: 'Orlando', country: 'US' },
  { icao: 'KORL', iata: 'ORL', name: 'Orlando Executive', city: 'Orlando', country: 'US' },
  { icao: 'KTPA', iata: 'TPA', name: 'Tampa International', city: 'Tampa', country: 'US' },
  { icao: 'KBOS', iata: 'BOS', name: 'Logan International', city: 'Boston', country: 'US' },
  { icao: 'KBED', iata: 'BED', name: 'Laurence G. Hanscom Field', city: 'Bedford', country: 'US' },
  { icao: 'KIAD', iata: 'IAD', name: 'Washington Dulles International', city: 'Washington D.C.', country: 'US' },
  { icao: 'KDCA', iata: 'DCA', name: 'Ronald Reagan Washington National', city: 'Washington D.C.', country: 'US' },
  { icao: 'KCGS', iata: 'CGS', name: 'College Park', city: 'College Park', country: 'US' },
  { icao: 'KLAS', iata: 'LAS', name: 'Harry Reid International', city: 'Las Vegas', country: 'US' },
  { icao: 'KVGT', iata: 'VGT', name: 'North Las Vegas', city: 'Las Vegas', country: 'US' },
  { icao: 'KHND', iata: 'HND', name: 'Henderson Executive', city: 'Henderson', country: 'US' },
  { icao: 'KPHX', iata: 'PHX', name: 'Phoenix Sky Harbor International', city: 'Phoenix', country: 'US' },
  { icao: 'KSDL', iata: 'SDL', name: 'Scottsdale', city: 'Scottsdale', country: 'US' },
  { icao: 'KSAN', iata: 'SAN', name: 'San Diego International', city: 'San Diego', country: 'US' },
  { icao: 'KCRQ', iata: 'CRQ', name: 'McClellan-Palomar', city: 'Carlsbad', country: 'US' },
  { icao: 'KMSP', iata: 'MSP', name: 'Minneapolis-Saint Paul International', city: 'Minneapolis', country: 'US' },
  { icao: 'KFCM', iata: 'FCM', name: 'Flying Cloud', city: 'Eden Prairie', country: 'US' },
  { icao: 'KDTW', iata: 'DTW', name: 'Detroit Metropolitan Wayne County', city: 'Detroit', country: 'US' },
  { icao: 'KPTK', iata: 'PTK', name: 'Oakland County International', city: 'Pontiac', country: 'US' },
  { icao: 'KPHL', iata: 'PHL', name: 'Philadelphia International', city: 'Philadelphia', country: 'US' },
  { icao: 'KHOU', iata: 'HOU', name: 'William P. Hobby', city: 'Houston', country: 'US' },
  { icao: 'KIAH', iata: 'IAH', name: 'George Bush Intercontinental', city: 'Houston', country: 'US' },
  { icao: 'KSGR', iata: 'SGR', name: 'Sugar Land Regional', city: 'Sugar Land', country: 'US' },
  { icao: 'KSAT', iata: 'SAT', name: 'San Antonio International', city: 'San Antonio', country: 'US' },
  { icao: 'KAUS', iata: 'AUS', name: 'Austin-Bergstrom International', city: 'Austin', country: 'US' },
  { icao: 'KMSY', iata: 'MSY', name: 'Louis Armstrong New Orleans International', city: 'New Orleans', country: 'US' },
  { icao: 'KBNA', iata: 'BNA', name: 'Nashville International', city: 'Nashville', country: 'US' },
  { icao: 'KJHN', iata: 'JHN', name: 'John C. Tune', city: 'Nashville', country: 'US' },
  { icao: 'KCLT', iata: 'CLT', name: 'Charlotte Douglas International', city: 'Charlotte', country: 'US' },
  { icao: 'KRDU', iata: 'RDU', name: 'Raleigh-Durham International', city: 'Raleigh', country: 'US' },
  { icao: 'KPIT', iata: 'PIT', name: 'Pittsburgh International', city: 'Pittsburgh', country: 'US' },
  { icao: 'KSTL', iata: 'STL', name: 'St. Louis Lambert International', city: 'St. Louis', country: 'US' },
  { icao: 'KCLE', iata: 'CLE', name: 'Cleveland Hopkins International', city: 'Cleveland', country: 'US' },
  { icao: 'KCMH', iata: 'CMH', name: 'John Glenn Columbus International', city: 'Columbus', country: 'US' },
  { icao: 'KIND', iata: 'IND', name: 'Indianapolis International', city: 'Indianapolis', country: 'US' },
  { icao: 'KMKE', iata: 'MKE', name: 'Milwaukee Mitchell International', city: 'Milwaukee', country: 'US' },
  { icao: 'KMCI', iata: 'MCI', name: 'Kansas City International', city: 'Kansas City', country: 'US' },
  { icao: 'KSLC', iata: 'SLC', name: 'Salt Lake City International', city: 'Salt Lake City', country: 'US' },
  { icao: 'KPDX', iata: 'PDX', name: 'Portland International', city: 'Portland', country: 'US' },
  { icao: 'KHNL', iata: 'HNL', name: 'Daniel K. Inouye International', city: 'Honolulu', country: 'US' },
  { icao: 'PHNL', iata: 'HNL', name: 'Daniel K. Inouye International', city: 'Honolulu', country: 'US' },
  { icao: 'PHKO', iata: 'KOA', name: 'Ellison Onizuka Kona International', city: 'Kailua-Kona', country: 'US' },
  { icao: 'PHOG', iata: 'OGG', name: 'Kahului', city: 'Kahului', country: 'US' },
  { icao: 'KASE', iata: 'ASE', name: 'Aspen-Pitkin County', city: 'Aspen', country: 'US' },
  { icao: 'KEGE', iata: 'EGE', name: 'Eagle County Regional', city: 'Vail', country: 'US' },
  { icao: 'KJAC', iata: 'JAC', name: 'Jackson Hole', city: 'Jackson', country: 'US' },
  { icao: 'KACK', iata: 'ACK', name: 'Nantucket Memorial', city: 'Nantucket', country: 'US' },
  { icao: 'KMVY', iata: 'MVY', name: "Martha's Vineyard", city: "Martha's Vineyard", country: 'US' },
  { icao: 'KHYA', iata: 'HYA', name: 'Barnstable Municipal / Boardman', city: 'Hyannis', country: 'US' },
  { icao: 'KPSP', iata: 'PSP', name: 'Palm Springs International', city: 'Palm Springs', country: 'US' },
  { icao: 'KTRM', iata: 'TRM', name: 'Jacqueline Cochran Regional', city: 'Thermal', country: 'US' },
  { icao: 'PANC', iata: 'ANC', name: 'Ted Stevens Anchorage International', city: 'Anchorage', country: 'US' },

  // Caribbean
  { icao: 'TNCM', iata: 'SXM', name: 'Princess Juliana International', city: 'St. Maarten', country: 'SX' },
  { icao: 'TBPB', iata: 'BGI', name: 'Grantley Adams International', city: 'Bridgetown', country: 'BB' },
  { icao: 'TIST', iata: 'STT', name: 'Cyril E. King', city: 'St. Thomas', country: 'VI' },
  { icao: 'TJSJ', iata: 'SJU', name: 'Luis Munoz Marin International', city: 'San Juan', country: 'PR' },
  { icao: 'MKJP', iata: 'KIN', name: 'Norman Manley International', city: 'Kingston', country: 'JM' },
  { icao: 'MKJS', iata: 'MBJ', name: 'Sangster International', city: 'Montego Bay', country: 'JM' },
  { icao: 'MYNN', iata: 'NAS', name: 'Lynden Pindling International', city: 'Nassau', country: 'BS' },
  { icao: 'MYEF', iata: 'ELH', name: 'North Eleuthera', city: 'North Eleuthera', country: 'BS' },
  { icao: 'MBPV', iata: 'PLS', name: 'Providenciales International', city: 'Providenciales', country: 'TC' },
  { icao: 'TNCB', iata: 'BON', name: 'Flamingo International', city: 'Bonaire', country: 'BQ' },
  { icao: 'TLPC', iata: 'SLU', name: 'George F. L. Charles', city: 'Castries', country: 'LC' },
  { icao: 'MDPC', iata: 'PUJ', name: 'Punta Cana International', city: 'Punta Cana', country: 'DO' },

  // Mexico
  { icao: 'MMMX', iata: 'MEX', name: 'Mexico City International', city: 'Mexico City', country: 'MX' },
  { icao: 'MMUN', iata: 'CUN', name: 'Cancun International', city: 'Cancun', country: 'MX' },
  { icao: 'MMSD', iata: 'SJD', name: 'Los Cabos International', city: 'San Jose del Cabo', country: 'MX' },
  { icao: 'MMPR', iata: 'PVR', name: 'Licenciado Gustavo Diaz Ordaz', city: 'Puerto Vallarta', country: 'MX' },

  // Canada
  { icao: 'CYYZ', iata: 'YYZ', name: 'Toronto Pearson International', city: 'Toronto', country: 'CA' },
  { icao: 'CYKZ', iata: 'YKZ', name: 'Toronto Buttonville Municipal', city: 'Toronto', country: 'CA' },
  { icao: 'CYUL', iata: 'YUL', name: 'Montreal-Trudeau International', city: 'Montreal', country: 'CA' },
  { icao: 'CYVR', iata: 'YVR', name: 'Vancouver International', city: 'Vancouver', country: 'CA' },
  { icao: 'CYOW', iata: 'YOW', name: 'Ottawa Macdonald-Cartier International', city: 'Ottawa', country: 'CA' },
  { icao: 'CYYC', iata: 'YYC', name: 'Calgary International', city: 'Calgary', country: 'CA' },

  // Europe
  { icao: 'EGLL', iata: 'LHR', name: 'Heathrow', city: 'London', country: 'GB' },
  { icao: 'EGLF', iata: 'FAB', name: 'Farnborough', city: 'Farnborough', country: 'GB' },
  { icao: 'EGGW', iata: 'LTN', name: 'Luton', city: 'London', country: 'GB' },
  { icao: 'EGKB', iata: 'BQH', name: 'Biggin Hill', city: 'London', country: 'GB' },
  { icao: 'EGSS', iata: 'STN', name: 'Stansted', city: 'London', country: 'GB' },
  { icao: 'LFPG', iata: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'FR' },
  { icao: 'LFPB', iata: 'LBG', name: 'Le Bourget', city: 'Paris', country: 'FR' },
  { icao: 'LFPO', iata: 'ORY', name: 'Orly', city: 'Paris', country: 'FR' },
  { icao: 'LFMN', iata: 'NCE', name: 'Nice Cote d\'Azur', city: 'Nice', country: 'FR' },
  { icao: 'LFMD', iata: 'CEQ', name: 'Cannes-Mandelieu', city: 'Cannes', country: 'FR' },
  { icao: 'EDDB', iata: 'BER', name: 'Berlin Brandenburg', city: 'Berlin', country: 'DE' },
  { icao: 'EDDM', iata: 'MUC', name: 'Munich', city: 'Munich', country: 'DE' },
  { icao: 'EDDF', iata: 'FRA', name: 'Frankfurt', city: 'Frankfurt', country: 'DE' },
  { icao: 'EHAM', iata: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'NL' },
  { icao: 'LSZH', iata: 'ZRH', name: 'Zurich', city: 'Zurich', country: 'CH' },
  { icao: 'LSGG', iata: 'GVA', name: 'Geneva', city: 'Geneva', country: 'CH' },
  { icao: 'LEMD', iata: 'MAD', name: 'Adolfo Suarez Madrid-Barajas', city: 'Madrid', country: 'ES' },
  { icao: 'LEBL', iata: 'BCN', name: 'Josep Tarradellas Barcelona-El Prat', city: 'Barcelona', country: 'ES' },
  { icao: 'LEIB', iata: 'IBZ', name: 'Ibiza', city: 'Ibiza', country: 'ES' },
  { icao: 'LEMG', iata: 'AGP', name: 'Malaga-Costa del Sol', city: 'Malaga', country: 'ES' },
  { icao: 'LPPT', iata: 'LIS', name: 'Lisbon Humberto Delgado', city: 'Lisbon', country: 'PT' },
  { icao: 'LIRF', iata: 'FCO', name: 'Leonardo da Vinci-Fiumicino', city: 'Rome', country: 'IT' },
  { icao: 'LIML', iata: 'LIN', name: 'Milano Linate', city: 'Milan', country: 'IT' },
  { icao: 'LIPZ', iata: 'VCE', name: 'Venice Marco Polo', city: 'Venice', country: 'IT' },
  { icao: 'LIRN', iata: 'NAP', name: 'Naples International', city: 'Naples', country: 'IT' },
  { icao: 'LOWW', iata: 'VIE', name: 'Vienna International', city: 'Vienna', country: 'AT' },
  { icao: 'EKCH', iata: 'CPH', name: 'Copenhagen', city: 'Copenhagen', country: 'DK' },
  { icao: 'ESSA', iata: 'ARN', name: 'Stockholm Arlanda', city: 'Stockholm', country: 'SE' },
  { icao: 'ENGM', iata: 'OSL', name: 'Oslo Gardermoen', city: 'Oslo', country: 'NO' },
  { icao: 'EIDW', iata: 'DUB', name: 'Dublin', city: 'Dublin', country: 'IE' },
  { icao: 'EFHK', iata: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', country: 'FI' },
  { icao: 'EPWA', iata: 'WAW', name: 'Warsaw Chopin', city: 'Warsaw', country: 'PL' },
  { icao: 'LKPR', iata: 'PRG', name: 'Vaclav Havel Prague', city: 'Prague', country: 'CZ' },
  { icao: 'LGAV', iata: 'ATH', name: 'Athens International', city: 'Athens', country: 'GR' },
  { icao: 'LGSR', iata: 'JTR', name: 'Santorini', city: 'Santorini', country: 'GR' },
  { icao: 'LGMK', iata: 'JMK', name: 'Mykonos', city: 'Mykonos', country: 'GR' },
  { icao: 'LTFM', iata: 'IST', name: 'Istanbul', city: 'Istanbul', country: 'TR' },
  { icao: 'LROP', iata: 'OTP', name: 'Henri Coanda International', city: 'Bucharest', country: 'RO' },
  { icao: 'LHBP', iata: 'BUD', name: 'Budapest Ferenc Liszt', city: 'Budapest', country: 'HU' },

  // Middle East
  { icao: 'OMDB', iata: 'DXB', name: 'Dubai International', city: 'Dubai', country: 'AE' },
  { icao: 'OMDW', iata: 'DWC', name: 'Al Maktoum International', city: 'Dubai', country: 'AE' },
  { icao: 'OMAA', iata: 'AUH', name: 'Abu Dhabi International', city: 'Abu Dhabi', country: 'AE' },
  { icao: 'OERK', iata: 'RUH', name: 'King Khalid International', city: 'Riyadh', country: 'SA' },
  { icao: 'OEJN', iata: 'JED', name: 'King Abdulaziz International', city: 'Jeddah', country: 'SA' },
  { icao: 'OTHH', iata: 'DOH', name: 'Hamad International', city: 'Doha', country: 'QA' },
  { icao: 'LLBG', iata: 'TLV', name: 'Ben Gurion International', city: 'Tel Aviv', country: 'IL' },

  // Asia-Pacific
  { icao: 'RJTT', iata: 'HND', name: 'Tokyo Haneda', city: 'Tokyo', country: 'JP' },
  { icao: 'RJAA', iata: 'NRT', name: 'Narita International', city: 'Tokyo', country: 'JP' },
  { icao: 'VHHH', iata: 'HKG', name: 'Hong Kong International', city: 'Hong Kong', country: 'HK' },
  { icao: 'WSSS', iata: 'SIN', name: 'Changi', city: 'Singapore', country: 'SG' },
  { icao: 'YSSY', iata: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'AU' },
  { icao: 'YMML', iata: 'MEL', name: 'Melbourne', city: 'Melbourne', country: 'AU' },
  { icao: 'ZBAA', iata: 'PEK', name: 'Beijing Capital International', city: 'Beijing', country: 'CN' },
  { icao: 'ZSPD', iata: 'PVG', name: 'Shanghai Pudong International', city: 'Shanghai', country: 'CN' },
  { icao: 'RKSI', iata: 'ICN', name: 'Incheon International', city: 'Seoul', country: 'KR' },
  { icao: 'VTBS', iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'TH' },
  { icao: 'WIII', iata: 'CGK', name: 'Soekarno-Hatta International', city: 'Jakarta', country: 'ID' },
  { icao: 'WADD', iata: 'DPS', name: 'Ngurah Rai International', city: 'Bali', country: 'ID' },
  { icao: 'VABB', iata: 'BOM', name: 'Chhatrapati Shivaji Maharaj International', city: 'Mumbai', country: 'IN' },
  { icao: 'VIDP', iata: 'DEL', name: 'Indira Gandhi International', city: 'New Delhi', country: 'IN' },
  { icao: 'NZAA', iata: 'AKL', name: 'Auckland', city: 'Auckland', country: 'NZ' },

  // Africa
  { icao: 'FAOR', iata: 'JNB', name: 'O.R. Tambo International', city: 'Johannesburg', country: 'ZA' },
  { icao: 'FACT', iata: 'CPT', name: 'Cape Town International', city: 'Cape Town', country: 'ZA' },
  { icao: 'HKJK', iata: 'NBO', name: 'Jomo Kenyatta International', city: 'Nairobi', country: 'KE' },
  { icao: 'DNMM', iata: 'LOS', name: 'Murtala Muhammed International', city: 'Lagos', country: 'NG' },
  { icao: 'HECA', iata: 'CAI', name: 'Cairo International', city: 'Cairo', country: 'EG' },
  { icao: 'GMMN', iata: 'CMN', name: 'Mohammed V International', city: 'Casablanca', country: 'MA' },
  { icao: 'GMME', iata: 'RBA', name: 'Rabat-Sale', city: 'Rabat', country: 'MA' },
  { icao: 'GMMX', iata: 'RAK', name: 'Marrakech Menara', city: 'Marrakech', country: 'MA' },

  // South America
  { icao: 'SBGR', iata: 'GRU', name: 'Sao Paulo-Guarulhos International', city: 'Sao Paulo', country: 'BR' },
  { icao: 'SAEZ', iata: 'EZE', name: 'Ministro Pistarini International', city: 'Buenos Aires', country: 'AR' },
  { icao: 'SCEL', iata: 'SCL', name: 'Arturo Merino Benitez International', city: 'Santiago', country: 'CL' },
  { icao: 'SKBO', iata: 'BOG', name: 'El Dorado International', city: 'Bogota', country: 'CO' },
  { icao: 'SKRG', iata: 'MDE', name: 'Jose Maria Cordova International', city: 'Medellin', country: 'CO' },
  { icao: 'SPJC', iata: 'LIM', name: 'Jorge Chavez International', city: 'Lima', country: 'PE' },
];

export function searchAirports(query: string): Airport[] {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase().trim();

  return AIRPORTS.filter(a =>
    a.icao.toLowerCase().includes(q) ||
    a.iata.toLowerCase().includes(q) ||
    a.name.toLowerCase().includes(q) ||
    a.city.toLowerCase().includes(q)
  ).slice(0, 8);
}

/** Resolve an ICAO or IATA code (any case) to its airport, if known. */
export function findAirport(code: string): Airport | undefined {
  const c = code.trim().toUpperCase();
  if (!c) return undefined;
  return AIRPORTS.find(a => a.icao === c || a.iata === c);
}

/** 'Honolulu · HNL'. Falls back to the code as given when the airport is unknown. */
export function airportLabel(code: string): string {
  const a = findAirport(code);
  return a ? `${a.city} · ${a.iata}` : code;
}
