export interface Airport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  /** Latitude and longitude in decimal degrees (OurAirports). */
  lat: number;
  lon: number;
}

export const AIRPORTS: Airport[] = [
  // United States - Major
  { icao: 'KJFK', iata: 'JFK', name: 'John F. Kennedy International', city: 'New York', country: 'US', lat: 40.6394, lon: -73.7793 },
  { icao: 'KLGA', iata: 'LGA', name: 'LaGuardia', city: 'New York', country: 'US', lat: 40.7772, lon: -73.8726 },
  { icao: 'KEWR', iata: 'EWR', name: 'Newark Liberty International', city: 'Newark', country: 'US', lat: 40.6894, lon: -74.1705 },
  { icao: 'KTEB', iata: 'TEB', name: 'Teterboro', city: 'Teterboro', country: 'US', lat: 40.8501, lon: -74.0608 },
  { icao: 'KHPN', iata: 'HPN', name: 'Westchester County', city: 'White Plains', country: 'US', lat: 41.0670, lon: -73.7076 },
  { icao: 'KFRG', iata: 'FRG', name: 'Republic', city: 'Farmingdale', country: 'US', lat: 40.7286, lon: -73.4143 },
  { icao: 'KLAX', iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'US', lat: 33.9425, lon: -118.4080 },
  { icao: 'KVNY', iata: 'VNY', name: 'Van Nuys', city: 'Van Nuys', country: 'US', lat: 34.2098, lon: -118.4900 },
  { icao: 'KSMO', iata: 'SMO', name: 'Santa Monica Municipal', city: 'Santa Monica', country: 'US', lat: 34.0158, lon: -118.4510 },
  { icao: 'KBUR', iata: 'BUR', name: 'Hollywood Burbank', city: 'Burbank', country: 'US', lat: 34.2028, lon: -118.3581 },
  { icao: 'KSNA', iata: 'SNA', name: 'John Wayne / Orange County', city: 'Santa Ana', country: 'US', lat: 33.6751, lon: -117.8693 },
  { icao: 'KORD', iata: 'ORD', name: "O'Hare International", city: 'Chicago', country: 'US', lat: 41.9786, lon: -87.9048 },
  { icao: 'KMDW', iata: 'MDW', name: 'Midway International', city: 'Chicago', country: 'US', lat: 41.7860, lon: -87.7524 },
  { icao: 'KPWK', iata: 'PWK', name: 'Chicago Executive', city: 'Wheeling', country: 'US', lat: 42.1142, lon: -87.9015 },
  { icao: 'KDPA', iata: 'DPA', name: 'DuPage', city: 'West Chicago', country: 'US', lat: 41.9078, lon: -88.2486 },
  { icao: 'KATL', iata: 'ATL', name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', country: 'US', lat: 33.6367, lon: -84.4281 },
  { icao: 'KPDK', iata: 'PDK', name: 'DeKalb-Peachtree', city: 'Atlanta', country: 'US', lat: 33.8763, lon: -84.3021 },
  { icao: 'KDFW', iata: 'DFW', name: 'Dallas/Fort Worth International', city: 'Dallas', country: 'US', lat: 32.8968, lon: -97.0380 },
  { icao: 'KDAL', iata: 'DAL', name: 'Dallas Love Field', city: 'Dallas', country: 'US', lat: 32.8448, lon: -96.8477 },
  { icao: 'KADS', iata: 'ADS', name: 'Addison', city: 'Addison', country: 'US', lat: 32.9686, lon: -96.8364 },
  { icao: 'KDEN', iata: 'DEN', name: 'Denver International', city: 'Denver', country: 'US', lat: 39.8600, lon: -104.6738 },
  { icao: 'KAPA', iata: 'APA', name: 'Centennial', city: 'Englewood', country: 'US', lat: 39.5701, lon: -104.8490 },
  { icao: 'KSFB', iata: 'SFB', name: 'Orlando Sanford International', city: 'Sanford', country: 'US', lat: 28.7743, lon: -81.2346 },
  { icao: 'KSFO', iata: 'SFO', name: 'San Francisco International', city: 'San Francisco', country: 'US', lat: 37.6198, lon: -122.3748 },
  { icao: 'KOAK', iata: 'OAK', name: 'Oakland International', city: 'Oakland', country: 'US', lat: 37.7201, lon: -122.2212 },
  { icao: 'KSJC', iata: 'SJC', name: 'San Jose International', city: 'San Jose', country: 'US', lat: 37.3625, lon: -121.9292 },
  { icao: 'KPAO', iata: 'PAO', name: 'Palo Alto', city: 'Palo Alto', country: 'US', lat: 37.4611, lon: -122.1150 },
  { icao: 'KSEA', iata: 'SEA', name: 'Seattle-Tacoma International', city: 'Seattle', country: 'US', lat: 47.4479, lon: -122.3103 },
  { icao: 'KBFI', iata: 'BFI', name: 'Boeing Field / King County', city: 'Seattle', country: 'US', lat: 47.5270, lon: -122.2999 },
  { icao: 'KMIA', iata: 'MIA', name: 'Miami International', city: 'Miami', country: 'US', lat: 25.7960, lon: -80.2898 },
  { icao: 'KOPF', iata: 'OPF', name: 'Miami-Opa Locka Executive', city: 'Miami', country: 'US', lat: 25.9070, lon: -80.2784 },
  { icao: 'KFXE', iata: 'FXE', name: 'Fort Lauderdale Executive', city: 'Fort Lauderdale', country: 'US', lat: 26.1973, lon: -80.1707 },
  { icao: 'KFLL', iata: 'FLL', name: 'Fort Lauderdale-Hollywood International', city: 'Fort Lauderdale', country: 'US', lat: 26.0726, lon: -80.1527 },
  { icao: 'KPBI', iata: 'PBI', name: 'Palm Beach International', city: 'West Palm Beach', country: 'US', lat: 26.6832, lon: -80.0956 },
  { icao: 'KBCT', iata: 'BCT', name: 'Boca Raton', city: 'Boca Raton', country: 'US', lat: 26.3785, lon: -80.1077 },
  { icao: 'KMCO', iata: 'MCO', name: 'Orlando International', city: 'Orlando', country: 'US', lat: 28.4294, lon: -81.3090 },
  { icao: 'KORL', iata: 'ORL', name: 'Orlando Executive', city: 'Orlando', country: 'US', lat: 28.5455, lon: -81.3329 },
  { icao: 'KTPA', iata: 'TPA', name: 'Tampa International', city: 'Tampa', country: 'US', lat: 27.9755, lon: -82.5332 },
  { icao: 'KBOS', iata: 'BOS', name: 'Logan International', city: 'Boston', country: 'US', lat: 42.3620, lon: -71.0079 },
  { icao: 'KBED', iata: 'BED', name: 'Laurence G. Hanscom Field', city: 'Bedford', country: 'US', lat: 42.4700, lon: -71.2890 },
  { icao: 'KIAD', iata: 'IAD', name: 'Washington Dulles International', city: 'Washington D.C.', country: 'US', lat: 38.9445, lon: -77.4558 },
  { icao: 'KDCA', iata: 'DCA', name: 'Ronald Reagan Washington National', city: 'Washington D.C.', country: 'US', lat: 38.8521, lon: -77.0377 },
  { icao: 'KCGS', iata: 'CGS', name: 'College Park', city: 'College Park', country: 'US', lat: 38.9806, lon: -76.9223 },
  { icao: 'KLAS', iata: 'LAS', name: 'Harry Reid International', city: 'Las Vegas', country: 'US', lat: 36.0834, lon: -115.1518 },
  { icao: 'KVGT', iata: 'VGT', name: 'North Las Vegas', city: 'Las Vegas', country: 'US', lat: 36.2091, lon: -115.1940 },
  { icao: 'KHND', iata: 'HSH', name: 'Henderson Executive', city: 'Henderson', country: 'US', lat: 35.9728, lon: -115.1340 },
  { icao: 'KPHX', iata: 'PHX', name: 'Phoenix Sky Harbor International', city: 'Phoenix', country: 'US', lat: 33.4353, lon: -112.0059 },
  { icao: 'KSDL', iata: 'SCF', name: 'Scottsdale', city: 'Scottsdale', country: 'US', lat: 33.6229, lon: -111.9110 },
  { icao: 'KSAN', iata: 'SAN', name: 'San Diego International', city: 'San Diego', country: 'US', lat: 32.7336, lon: -117.1900 },
  { icao: 'KCRQ', iata: 'CLD', name: 'McClellan-Palomar', city: 'Carlsbad', country: 'US', lat: 33.1283, lon: -117.2800 },
  { icao: 'KMSP', iata: 'MSP', name: 'Minneapolis-Saint Paul International', city: 'Minneapolis', country: 'US', lat: 44.8801, lon: -93.2217 },
  { icao: 'KFCM', iata: 'FCM', name: 'Flying Cloud', city: 'Eden Prairie', country: 'US', lat: 44.8272, lon: -93.4571 },
  { icao: 'KDTW', iata: 'DTW', name: 'Detroit Metropolitan Wayne County', city: 'Detroit', country: 'US', lat: 42.2138, lon: -83.3538 },
  { icao: 'KPTK', iata: 'PTK', name: 'Oakland County International', city: 'Pontiac', country: 'US', lat: 42.6655, lon: -83.4201 },
  { icao: 'KPHL', iata: 'PHL', name: 'Philadelphia International', city: 'Philadelphia', country: 'US', lat: 39.8719, lon: -75.2411 },
  { icao: 'KHOU', iata: 'HOU', name: 'William P. Hobby', city: 'Houston', country: 'US', lat: 29.6453, lon: -95.2768 },
  { icao: 'KIAH', iata: 'IAH', name: 'George Bush Intercontinental', city: 'Houston', country: 'US', lat: 29.9844, lon: -95.3414 },
  { icao: 'KSGR', iata: 'SGR', name: 'Sugar Land Regional', city: 'Sugar Land', country: 'US', lat: 29.6223, lon: -95.6565 },
  { icao: 'KSAT', iata: 'SAT', name: 'San Antonio International', city: 'San Antonio', country: 'US', lat: 29.5337, lon: -98.4698 },
  { icao: 'KAUS', iata: 'AUS', name: 'Austin-Bergstrom International', city: 'Austin', country: 'US', lat: 30.1975, lon: -97.6620 },
  { icao: 'KMSY', iata: 'MSY', name: 'Louis Armstrong New Orleans International', city: 'New Orleans', country: 'US', lat: 29.9934, lon: -90.2647 },
  { icao: 'KBNA', iata: 'BNA', name: 'Nashville International', city: 'Nashville', country: 'US', lat: 36.1245, lon: -86.6782 },
  { icao: 'KJHN', iata: 'JHN', name: 'John C. Tune', city: 'Nashville', country: 'US', lat: 37.5830, lon: -101.7330 },
  { icao: 'KCLT', iata: 'CLT', name: 'Charlotte Douglas International', city: 'Charlotte', country: 'US', lat: 35.2140, lon: -80.9431 },
  { icao: 'KRDU', iata: 'RDU', name: 'Raleigh-Durham International', city: 'Raleigh', country: 'US', lat: 35.8787, lon: -78.7873 },
  { icao: 'KPIT', iata: 'PIT', name: 'Pittsburgh International', city: 'Pittsburgh', country: 'US', lat: 40.4915, lon: -80.2329 },
  { icao: 'KSTL', iata: 'STL', name: 'St. Louis Lambert International', city: 'St. Louis', country: 'US', lat: 38.7487, lon: -90.3700 },
  { icao: 'KCLE', iata: 'CLE', name: 'Cleveland Hopkins International', city: 'Cleveland', country: 'US', lat: 41.4117, lon: -81.8498 },
  { icao: 'KCMH', iata: 'CMH', name: 'John Glenn Columbus International', city: 'Columbus', country: 'US', lat: 39.9980, lon: -82.8919 },
  { icao: 'KIND', iata: 'IND', name: 'Indianapolis International', city: 'Indianapolis', country: 'US', lat: 39.7173, lon: -86.2944 },
  { icao: 'KMKE', iata: 'MKE', name: 'Milwaukee Mitchell International', city: 'Milwaukee', country: 'US', lat: 42.9472, lon: -87.8966 },
  { icao: 'KMCI', iata: 'MCI', name: 'Kansas City International', city: 'Kansas City', country: 'US', lat: 39.3017, lon: -94.7139 },
  { icao: 'KSLC', iata: 'SLC', name: 'Salt Lake City International', city: 'Salt Lake City', country: 'US', lat: 40.7889, lon: -111.9799 },
  { icao: 'KPDX', iata: 'PDX', name: 'Portland International', city: 'Portland', country: 'US', lat: 45.5887, lon: -122.5980 },
  { icao: 'PHNL', iata: 'HNL', name: 'Daniel K. Inouye International', city: 'Honolulu', country: 'US', lat: 21.3184, lon: -157.9257 },
  { icao: 'PHKO', iata: 'KOA', name: 'Ellison Onizuka Kona International', city: 'Kailua-Kona', country: 'US', lat: 19.7388, lon: -156.0456 },
  { icao: 'PHOG', iata: 'OGG', name: 'Kahului', city: 'Kahului', country: 'US', lat: 20.8963, lon: -156.4318 },
  { icao: 'KASE', iata: 'ASE', name: 'Aspen-Pitkin County', city: 'Aspen', country: 'US', lat: 39.2232, lon: -106.8690 },
  { icao: 'KEGE', iata: 'EGE', name: 'Eagle County Regional', city: 'Vail', country: 'US', lat: 39.6426, lon: -106.9180 },
  { icao: 'KJAC', iata: 'JAC', name: 'Jackson Hole', city: 'Jackson', country: 'US', lat: 43.6073, lon: -110.7380 },
  { icao: 'KACK', iata: 'ACK', name: 'Nantucket Memorial', city: 'Nantucket', country: 'US', lat: 41.2531, lon: -70.0602 },
  { icao: 'KMVY', iata: 'MVY', name: "Martha's Vineyard", city: "Martha's Vineyard", country: 'US', lat: 41.3931, lon: -70.6143 },
  { icao: 'KHYA', iata: 'HYA', name: 'Barnstable Municipal / Boardman', city: 'Hyannis', country: 'US', lat: 41.6693, lon: -70.2804 },
  { icao: 'KPSP', iata: 'PSP', name: 'Palm Springs International', city: 'Palm Springs', country: 'US', lat: 33.8297, lon: -116.5070 },
  { icao: 'KTRM', iata: 'TRM', name: 'Jacqueline Cochran Regional', city: 'Thermal', country: 'US', lat: 33.6267, lon: -116.1600 },
  { icao: 'PANC', iata: 'ANC', name: 'Ted Stevens Anchorage International', city: 'Anchorage', country: 'US', lat: 61.1790, lon: -149.9926 },

  // Caribbean
  { icao: 'TNCM', iata: 'SXM', name: 'Princess Juliana International', city: 'St. Maarten', country: 'SX', lat: 18.0410, lon: -63.1089 },
  { icao: 'TBPB', iata: 'BGI', name: 'Grantley Adams International', city: 'Bridgetown', country: 'BB', lat: 13.0747, lon: -59.4910 },
  { icao: 'TIST', iata: 'STT', name: 'Cyril E. King', city: 'St. Thomas', country: 'VI', lat: 18.3371, lon: -64.9773 },
  { icao: 'TJSJ', iata: 'SJU', name: 'Luis Munoz Marin International', city: 'San Juan', country: 'PR', lat: 18.4394, lon: -66.0018 },
  { icao: 'MKJP', iata: 'KIN', name: 'Norman Manley International', city: 'Kingston', country: 'JM', lat: 17.9357, lon: -76.7875 },
  { icao: 'MKJS', iata: 'MBJ', name: 'Sangster International', city: 'Montego Bay', country: 'JM', lat: 18.5034, lon: -77.9132 },
  { icao: 'MYNN', iata: 'NAS', name: 'Lynden Pindling International', city: 'Nassau', country: 'BS', lat: 25.0390, lon: -77.4662 },
  { icao: 'MYEH', iata: 'ELH', name: 'North Eleuthera', city: 'North Eleuthera', country: 'BS', lat: 25.4758, lon: -76.6808 },
  { icao: 'MBPV', iata: 'PLS', name: 'Providenciales International', city: 'Providenciales', country: 'TC', lat: 21.7737, lon: -72.2683 },
  { icao: 'TNCB', iata: 'BON', name: 'Flamingo International', city: 'Bonaire', country: 'BQ', lat: 12.1310, lon: -68.2685 },
  { icao: 'TLPC', iata: 'SLU', name: 'George F. L. Charles', city: 'Castries', country: 'LC', lat: 14.0202, lon: -60.9929 },
  { icao: 'MDPC', iata: 'PUJ', name: 'Punta Cana International', city: 'Punta Cana', country: 'DO', lat: 18.5671, lon: -68.3646 },

  // Mexico
  { icao: 'MMMX', iata: 'MEX', name: 'Mexico City International', city: 'Mexico City', country: 'MX', lat: 19.4358, lon: -99.0703 },
  { icao: 'MMUN', iata: 'CUN', name: 'Cancun International', city: 'Cancun', country: 'MX', lat: 21.0408, lon: -86.8735 },
  { icao: 'MMSD', iata: 'SJD', name: 'Los Cabos International', city: 'San Jose del Cabo', country: 'MX', lat: 23.1519, lon: -109.7207 },
  { icao: 'MMPR', iata: 'PVR', name: 'Licenciado Gustavo Diaz Ordaz', city: 'Puerto Vallarta', country: 'MX', lat: 20.6799, lon: -105.2544 },

  // Canada
  { icao: 'CYYZ', iata: 'YYZ', name: 'Toronto Pearson International', city: 'Toronto', country: 'CA', lat: 43.6759, lon: -79.6294 },
  { icao: 'CYUL', iata: 'YUL', name: 'Montreal-Trudeau International', city: 'Montreal', country: 'CA', lat: 45.4678, lon: -73.7423 },
  { icao: 'CYVR', iata: 'YVR', name: 'Vancouver International', city: 'Vancouver', country: 'CA', lat: 49.1939, lon: -123.1840 },
  { icao: 'CYOW', iata: 'YOW', name: 'Ottawa Macdonald-Cartier International', city: 'Ottawa', country: 'CA', lat: 45.3225, lon: -75.6692 },
  { icao: 'CYYC', iata: 'YYC', name: 'Calgary International', city: 'Calgary', country: 'CA', lat: 51.1188, lon: -114.0099 },

  // Europe
  { icao: 'EGLL', iata: 'LHR', name: 'Heathrow', city: 'London', country: 'GB', lat: 51.4707, lon: -0.4599 },
  { icao: 'EGLF', iata: 'FAB', name: 'Farnborough', city: 'Farnborough', country: 'GB', lat: 51.2758, lon: -0.7763 },
  { icao: 'EGGW', iata: 'LTN', name: 'Luton', city: 'London', country: 'GB', lat: 51.8747, lon: -0.3683 },
  { icao: 'EGKB', iata: 'BQH', name: 'Biggin Hill', city: 'London', country: 'GB', lat: 51.3308, lon: 0.0325 },
  { icao: 'EGSS', iata: 'STN', name: 'Stansted', city: 'London', country: 'GB', lat: 51.8850, lon: 0.2350 },
  { icao: 'LFPG', iata: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'FR', lat: 49.0090, lon: 2.5541 },
  { icao: 'LFPB', iata: 'LBG', name: 'Le Bourget', city: 'Paris', country: 'FR', lat: 48.9623, lon: 2.4365 },
  { icao: 'LFPO', iata: 'ORY', name: 'Orly', city: 'Paris', country: 'FR', lat: 48.7295, lon: 2.3590 },
  { icao: 'LFMN', iata: 'NCE', name: 'Nice Cote d\'Azur', city: 'Nice', country: 'FR', lat: 43.6584, lon: 7.2159 },
  { icao: 'LFMD', iata: 'CEQ', name: 'Cannes-Mandelieu', city: 'Cannes', country: 'FR', lat: 43.5480, lon: 6.9552 },
  { icao: 'EDDB', iata: 'BER', name: 'Berlin Brandenburg', city: 'Berlin', country: 'DE', lat: 52.3617, lon: 13.5023 },
  { icao: 'EDDM', iata: 'MUC', name: 'Munich', city: 'Munich', country: 'DE', lat: 48.3538, lon: 11.7861 },
  { icao: 'EDDF', iata: 'FRA', name: 'Frankfurt', city: 'Frankfurt', country: 'DE', lat: 50.0267, lon: 8.5584 },
  { icao: 'EHAM', iata: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'NL', lat: 52.3086, lon: 4.7639 },
  { icao: 'LSZH', iata: 'ZRH', name: 'Zurich', city: 'Zurich', country: 'CH', lat: 47.4581, lon: 8.5481 },
  { icao: 'LSGG', iata: 'GVA', name: 'Geneva', city: 'Geneva', country: 'CH', lat: 46.2381, lon: 6.1090 },
  { icao: 'LEMD', iata: 'MAD', name: 'Adolfo Suarez Madrid-Barajas', city: 'Madrid', country: 'ES', lat: 40.4934, lon: -3.5722 },
  { icao: 'LEBL', iata: 'BCN', name: 'Josep Tarradellas Barcelona-El Prat', city: 'Barcelona', country: 'ES', lat: 41.2971, lon: 2.0785 },
  { icao: 'LEIB', iata: 'IBZ', name: 'Ibiza', city: 'Ibiza', country: 'ES', lat: 38.8729, lon: 1.3731 },
  { icao: 'LEMG', iata: 'AGP', name: 'Malaga-Costa del Sol', city: 'Malaga', country: 'ES', lat: 36.6782, lon: -4.5002 },
  { icao: 'LPPT', iata: 'LIS', name: 'Lisbon Humberto Delgado', city: 'Lisbon', country: 'PT', lat: 38.7813, lon: -9.1359 },
  { icao: 'LIRF', iata: 'FCO', name: 'Leonardo da Vinci-Fiumicino', city: 'Rome', country: 'IT', lat: 41.8045, lon: 12.2520 },
  { icao: 'LIML', iata: 'LIN', name: 'Milano Linate', city: 'Milan', country: 'IT', lat: 45.4451, lon: 9.2767 },
  { icao: 'LIPZ', iata: 'VCE', name: 'Venice Marco Polo', city: 'Venice', country: 'IT', lat: 45.5053, lon: 12.3519 },
  { icao: 'LIRN', iata: 'NAP', name: 'Naples International', city: 'Naples', country: 'IT', lat: 40.8860, lon: 14.2908 },
  { icao: 'LOWW', iata: 'VIE', name: 'Vienna International', city: 'Vienna', country: 'AT', lat: 48.1103, lon: 16.5697 },
  { icao: 'EKCH', iata: 'CPH', name: 'Copenhagen', city: 'Copenhagen', country: 'DK', lat: 55.6179, lon: 12.6560 },
  { icao: 'ESSA', iata: 'ARN', name: 'Stockholm Arlanda', city: 'Stockholm', country: 'SE', lat: 59.6485, lon: 17.9288 },
  { icao: 'ENGM', iata: 'OSL', name: 'Oslo Gardermoen', city: 'Oslo', country: 'NO', lat: 60.1939, lon: 11.1004 },
  { icao: 'EIDW', iata: 'DUB', name: 'Dublin', city: 'Dublin', country: 'IE', lat: 53.4287, lon: -6.2621 },
  { icao: 'EFHK', iata: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', country: 'FI', lat: 60.3184, lon: 24.9633 },
  { icao: 'EPWA', iata: 'WAW', name: 'Warsaw Chopin', city: 'Warsaw', country: 'PL', lat: 52.1657, lon: 20.9671 },
  { icao: 'LKPR', iata: 'PRG', name: 'Vaclav Havel Prague', city: 'Prague', country: 'CZ', lat: 50.1009, lon: 14.2599 },
  { icao: 'LGAV', iata: 'ATH', name: 'Athens International', city: 'Athens', country: 'GR', lat: 37.9364, lon: 23.9445 },
  { icao: 'LGSR', iata: 'JTR', name: 'Santorini', city: 'Santorini', country: 'GR', lat: 36.4000, lon: 25.4786 },
  { icao: 'LGMK', iata: 'JMK', name: 'Mykonos', city: 'Mykonos', country: 'GR', lat: 37.4351, lon: 25.3481 },
  { icao: 'LTFM', iata: 'IST', name: 'Istanbul', city: 'Istanbul', country: 'TR', lat: 41.2749, lon: 28.7321 },
  { icao: 'LROP', iata: 'OTP', name: 'Henri Coanda International', city: 'Bucharest', country: 'RO', lat: 44.5718, lon: 26.1033 },
  { icao: 'LHBP', iata: 'BUD', name: 'Budapest Ferenc Liszt', city: 'Budapest', country: 'HU', lat: 47.4302, lon: 19.2624 },

  // Middle East
  { icao: 'OMDB', iata: 'DXB', name: 'Dubai International', city: 'Dubai', country: 'AE', lat: 25.2498, lon: 55.3710 },
  { icao: 'OMDW', iata: 'DWC', name: 'Al Maktoum International', city: 'Dubai', country: 'AE', lat: 24.8962, lon: 55.1624 },
  { icao: 'OMAA', iata: 'AUH', name: 'Abu Dhabi International', city: 'Abu Dhabi', country: 'AE', lat: 24.4410, lon: 54.6492 },
  { icao: 'OERK', iata: 'RUH', name: 'King Khalid International', city: 'Riyadh', country: 'SA', lat: 24.9576, lon: 46.6988 },
  { icao: 'OEJN', iata: 'JED', name: 'King Abdulaziz International', city: 'Jeddah', country: 'SA', lat: 21.6802, lon: 39.1574 },
  { icao: 'OTHH', iata: 'DOH', name: 'Hamad International', city: 'Doha', country: 'QA', lat: 25.2731, lon: 51.6081 },
  { icao: 'LLBG', iata: 'TLV', name: 'Ben Gurion International', city: 'Tel Aviv', country: 'IL', lat: 32.0114, lon: 34.8867 },

  // Asia-Pacific
  { icao: 'RJTT', iata: 'HND', name: 'Tokyo Haneda', city: 'Tokyo', country: 'JP', lat: 35.5497, lon: 139.7870 },
  { icao: 'RJAA', iata: 'NRT', name: 'Narita International', city: 'Tokyo', country: 'JP', lat: 35.7686, lon: 140.3887 },
  { icao: 'VHHH', iata: 'HKG', name: 'Hong Kong International', city: 'Hong Kong', country: 'HK', lat: 22.3118, lon: 113.9149 },
  { icao: 'WSSS', iata: 'SIN', name: 'Changi', city: 'Singapore', country: 'SG', lat: 1.3502, lon: 103.9940 },
  { icao: 'YSSY', iata: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'AU', lat: -33.9461, lon: 151.1770 },
  { icao: 'YMML', iata: 'MEL', name: 'Melbourne', city: 'Melbourne', country: 'AU', lat: -37.6707, lon: 144.8379 },
  { icao: 'ZBAA', iata: 'PEK', name: 'Beijing Capital International', city: 'Beijing', country: 'CN', lat: 40.0773, lon: 116.5967 },
  { icao: 'ZSPD', iata: 'PVG', name: 'Shanghai Pudong International', city: 'Shanghai', country: 'CN', lat: 31.1434, lon: 121.8050 },
  { icao: 'RKSI', iata: 'ICN', name: 'Incheon International', city: 'Seoul', country: 'KR', lat: 37.4691, lon: 126.4510 },
  { icao: 'VTBS', iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'TH', lat: 13.6811, lon: 100.7470 },
  { icao: 'WIII', iata: 'CGK', name: 'Soekarno-Hatta International', city: 'Jakarta', country: 'ID', lat: -6.1256, lon: 106.6560 },
  { icao: 'WADD', iata: 'DPS', name: 'Ngurah Rai International', city: 'Bali', country: 'ID', lat: -8.7484, lon: 115.1671 },
  { icao: 'VABB', iata: 'BOM', name: 'Chhatrapati Shivaji Maharaj International', city: 'Mumbai', country: 'IN', lat: 19.0887, lon: 72.8679 },
  { icao: 'VIDP', iata: 'DEL', name: 'Indira Gandhi International', city: 'New Delhi', country: 'IN', lat: 28.5556, lon: 77.0952 },
  { icao: 'NZAA', iata: 'AKL', name: 'Auckland', city: 'Auckland', country: 'NZ', lat: -37.0120, lon: 174.7863 },

  // Africa
  { icao: 'FAOR', iata: 'JNB', name: 'O.R. Tambo International', city: 'Johannesburg', country: 'ZA', lat: -26.1401, lon: 28.2468 },
  { icao: 'FACT', iata: 'CPT', name: 'Cape Town International', city: 'Cape Town', country: 'ZA', lat: -33.9740, lon: 18.6043 },
  { icao: 'HKJK', iata: 'NBO', name: 'Jomo Kenyatta International', city: 'Nairobi', country: 'KE', lat: -1.3189, lon: 36.9282 },
  { icao: 'DNMM', iata: 'LOS', name: 'Murtala Muhammed International', city: 'Lagos', country: 'NG', lat: 6.5774, lon: 3.3212 },
  { icao: 'HECA', iata: 'CAI', name: 'Cairo International', city: 'Cairo', country: 'EG', lat: 30.1115, lon: 31.3967 },
  { icao: 'GMMN', iata: 'CMN', name: 'Mohammed V International', city: 'Casablanca', country: 'MA', lat: 33.3675, lon: -7.5900 },
  { icao: 'GMME', iata: 'RBA', name: 'Rabat-Sale', city: 'Rabat', country: 'MA', lat: 34.0515, lon: -6.7515 },
  { icao: 'GMMX', iata: 'RAK', name: 'Marrakech Menara', city: 'Marrakech', country: 'MA', lat: 31.6048, lon: -8.0358 },

  // South America
  { icao: 'SBGR', iata: 'GRU', name: 'Sao Paulo-Guarulhos International', city: 'Sao Paulo', country: 'BR', lat: -23.4313, lon: -46.4700 },
  { icao: 'SAEZ', iata: 'EZE', name: 'Ministro Pistarini International', city: 'Buenos Aires', country: 'AR', lat: -34.8222, lon: -58.5358 },
  { icao: 'SCEL', iata: 'SCL', name: 'Arturo Merino Benitez International', city: 'Santiago', country: 'CL', lat: -33.3930, lon: -70.7858 },
  { icao: 'SKBO', iata: 'BOG', name: 'El Dorado International', city: 'Bogota', country: 'CO', lat: 4.7016, lon: -74.1469 },
  { icao: 'SKRG', iata: 'MDE', name: 'Jose Maria Cordova International', city: 'Medellin', country: 'CO', lat: 6.1645, lon: -75.4231 },
  { icao: 'SPJC', iata: 'LIM', name: 'Jorge Chavez International', city: 'Lima', country: 'PE', lat: -12.0219, lon: -77.1143 },
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
