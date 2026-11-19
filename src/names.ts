// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { makeTeam } from "./match.ts";
import type { Team } from "./match.ts";
import type { Rng } from "./rng.ts";

/**
 * Name generators for teams ("<City> <Mascot>") and players. Players are drawn
 * from the naming traditions of the major cricket-playing regions. Names are
 * random combinations of common given names and surnames, so a generated name
 * can coincide with a real person; none is meant to be one.
 */

export type Region = "south-asia" | "uk-ireland" | "afghanistan" | "anz" | "south-africa" | "caribbean" | "zimbabwe";
export type RegionChoice = Region | "world";

export const REGIONS: readonly { id: Region; label: string }[] = [
  { id: "south-asia", label: "Subcontinent (India, Pakistan, Bangladesh, Sri Lanka, Nepal)" },
  { id: "uk-ireland", label: "UK and Ireland" },
  { id: "afghanistan", label: "Afghanistan" },
  { id: "anz", label: "Australia and New Zealand" },
  { id: "south-africa", label: "South Africa" },
  { id: "caribbean", label: "Caribbean" },
  { id: "zimbabwe", label: "Zimbabwe" },
];

export const REGION_CHOICES: readonly { id: RegionChoice; label: string }[] = [
  { id: "world", label: "Mixed world" },
  ...REGIONS,
];

/** A naming tradition: given names and surnames that go together. */
export interface NameGroup {
  first: readonly string[];
  last: readonly string[];
}

export const NAME_GROUPS: Record<Region, readonly NameGroup[]> = {
  "south-asia": [
    { // Indian
      first: ["Aarav", "Aditya", "Ananya", "Arjun", "Dev", "Diya", "Ishaan", "Kabir", "Kavya", "Lakshmi", "Manish", "Meera", "Neha", "Nikhil", "Priyanka", "Rahul", "Rohan", "Saanvi", "Sanjay", "Siddharth", "Tanvi", "Vikram", "Yash", "Zoya", "Harpreet", "Gurpreet", "Jasleen", "Amit", "Pooja", "Rajesh", "Sunita", "Varun", "Ritu", "Karan", "Anjali", "Deepak", "Shreya", "Vivek", "Isha", "Mohit"],
      last: ["Sharma", "Patel", "Singh", "Gupta", "Mehta", "Reddy", "Iyer", "Nair", "Kapoor", "Joshi", "Chopra", "Banerjee", "Chatterjee", "Desai", "Menon", "Rao", "Verma", "Bhatt", "Malhotra", "Kulkarni", "Pillai", "Sethi", "Bose", "Dhillon", "Gill", "Sandhu", "Agarwal", "Khanna", "Sinha", "Naidu"],
    },
    { // Pakistani
      first: ["Ahmed", "Ali", "Ayesha", "Bilal", "Fatima", "Hamza", "Hassan", "Imran", "Iqra", "Kamran", "Maryam", "Nadia", "Omar", "Rabia", "Saad", "Sana", "Shahid", "Tariq", "Usman", "Zainab", "Zara", "Faisal", "Haris", "Junaid", "Mehwish", "Noman", "Sadia", "Yasir", "Zubair", "Asad", "Danish"],
      last: ["Khan", "Malik", "Qureshi", "Siddiqui", "Chaudhry", "Butt", "Sheikh", "Raza", "Hussain", "Mirza", "Abbasi", "Farooqi", "Ansari", "Baig", "Rana", "Javed", "Naqvi", "Gilani", "Cheema", "Awan"],
    },
    { // Bangladeshi
      first: ["Anik", "Rafiq", "Sabbir", "Nusrat", "Rubel", "Farhana", "Jahid", "Rashed", "Tahmina", "Sumon", "Nasrin", "Mizanur", "Sohel", "Nazmul", "Rumana", "Faruk", "Shafiq", "Taslima", "Shamim", "Mahmudul"],
      last: ["Hossain", "Rahman", "Islam", "Ahmed", "Chowdhury", "Uddin", "Mia", "Akter", "Sarkar", "Khatun", "Karim", "Bhuiyan", "Siddique", "Talukder", "Mondal"],
    },
    { // Sri Lankan
      first: ["Dilan", "Nuwan", "Chamari", "Kasun", "Lahiru", "Ishara", "Hasini", "Pasan", "Ruwan", "Sachini", "Tharindu", "Vimukthi", "Yasodha", "Amali", "Chathura", "Dhanushka", "Gayan", "Harshani", "Dinesh", "Nimali"],
      last: ["Perera", "Fernando", "Silva", "De Silva", "Jayawardena", "Wickramasinghe", "Gunasekara", "Bandara", "Dissanayake", "Samarasinghe", "Karunaratne", "Weerasinghe", "Senanayake", "Ratnayake", "Mendis", "Kumara", "Pathirana", "Rathnayake"],
    },
    { // Nepali
      first: ["Bikash", "Sunita", "Rajan", "Anita", "Sabina", "Prakash", "Binod", "Sushil", "Kamala", "Nabin"],
      last: ["Thapa", "Gurung", "Rai", "Shrestha", "Tamang", "Karki", "Adhikari", "Bhandari", "Limbu", "Poudel", "Basnet"],
    },
  ],
  "uk-ireland": [
    { // English
      first: ["Oliver", "Harry", "George", "Jack", "Charlie", "Alfie", "Oscar", "Freddie", "Thomas", "William", "Amelia", "Olivia", "Isla", "Grace", "Ruby", "Emily", "Sophie", "Lily", "Charlotte", "Georgia", "Jacob", "Ethan", "Joshua", "Harriet", "Eleanor", "Matilda", "Callum", "Dominic", "Hannah", "Rebecca", "Luke", "Nathan", "Freya", "Imogen"],
      last: ["Smith", "Taylor", "Brown", "Wilson", "Roberts", "Johnson", "Walker", "Wright", "Robinson", "Thompson", "White", "Edwards", "Green", "Hall", "Wood", "Harris", "Clarke", "Turner", "Hill", "Cooper", "Ward", "Morris", "Moore", "Bennett", "Carter", "Foster", "Hayes", "Pearce", "Barker", "Lawson", "Hartley", "Fletcher", "Ashworth", "Whitaker"],
    },
    { // Scottish
      first: ["Callum", "Fraser", "Ewan", "Hamish", "Iain", "Struan", "Kirsty", "Morag", "Isla", "Eilidh", "Lachlan", "Rory", "Fergus", "Mhairi", "Catriona", "Alasdair", "Duncan", "Gregor", "Shona", "Angus"],
      last: ["MacDonald", "Campbell", "Stewart", "Murray", "Reid", "Ferguson", "Robertson", "Cameron", "MacLeod", "Henderson", "Kerr", "Gordon", "Sinclair", "Munro", "Fraser", "Boyd", "Hamilton", "Buchanan", "Crawford"],
    },
    { // Welsh
      first: ["Rhys", "Owain", "Gareth", "Dafydd", "Ioan", "Cerys", "Seren", "Carys", "Bethan", "Megan", "Gethin", "Elin", "Tomos", "Rhiannon", "Huw", "Mared"],
      last: ["Jones", "Williams", "Davies", "Evans", "Thomas", "Roberts", "Hughes", "Morgan", "Griffiths", "Price", "Lloyd", "Pritchard", "Powell", "Bevan", "Rees", "Vaughan"],
    },
    { // Irish
      first: ["Seán", "Cian", "Conor", "Eoin", "Fionn", "Oisín", "Aoife", "Niamh", "Siobhán", "Saoirse", "Ciara", "Orla", "Padraig", "Declan", "Niall", "Brendan", "Róisín", "Clodagh", "Cormac", "Darragh"],
      last: ["Murphy", "Kelly", "O'Sullivan", "Walsh", "O'Brien", "Byrne", "Ryan", "O'Connor", "Doyle", "McCarthy", "Gallagher", "Doherty", "Kennedy", "Lynch", "Quinn", "McLoughlin", "Fitzgerald", "Brennan", "Nolan"],
    },
  ],
  afghanistan: [
    {
      first: ["Ahmad", "Mohammad", "Abdul", "Najib", "Hashmat", "Ibrahim", "Fareed", "Samiullah", "Noor", "Rahmat", "Zahir", "Karim", "Nasir", "Sediq", "Wahid", "Shir", "Hamid", "Jawad", "Bashir", "Farhad", "Laila", "Parwana", "Mina", "Freshta", "Zarghona", "Sima", "Shabnam"],
      last: ["Ahmadzai", "Zadran", "Stanikzai", "Karimi", "Noori", "Rahimi", "Safi", "Mangal", "Wardak", "Sadiqi", "Popalzai", "Barakzai", "Durrani", "Yousafzai", "Mohmand", "Kakar", "Niazi", "Hotak", "Alizai", "Sarwari", "Zazai"],
    },
  ],
  anz: [
    { // Australian
      first: ["Jack", "Lachlan", "Mitchell", "Cooper", "Riley", "Hayden", "Tyson", "Brodie", "Mia", "Charlotte", "Ruby", "Matilda", "Chloe", "Georgia", "Alyssa", "Tahlia", "Ashleigh", "Beth", "Kaitlyn", "Darcy", "Jarrod", "Brendan", "Shane", "Wade", "Alana", "Bree", "Kirra"],
      last: ["Smith", "Jones", "Williams", "Brown", "Wilson", "Taylor", "Anderson", "Thompson", "Walker", "Campbell", "Mitchell", "Cameron", "Hughes", "Fraser", "Reynolds", "Hartnett", "Kelly", "Cooper", "Sullivan", "Peters", "Marshall", "Bell"],
    },
    { // Multicultural Australian
      first: ["Jack", "Lachlan", "Mitchell", "Cooper", "Riley", "Hayden", "Mia", "Charlotte", "Ruby", "Chloe", "Alyssa", "Darcy", "Alana", "Bree"],
      last: ["Nguyen", "Tran", "Le", "Pham", "Papadopoulos", "Rossi", "Russo", "Hassan", "Khoury", "Singh", "Patel", "Chen", "Wong", "Kim", "Park", "Kaur"],
    },
    { // New Zealand
      first: ["Liam", "Noah", "Hunter", "Mason", "Finn", "Hayley", "Sophie", "Amelia", "Maddy", "Lucy", "Ben", "Cameron", "Josh", "Rachel", "Katie", "Jesse", "Tim", "Kerry"],
      last: ["Smith", "Wilson", "Taylor", "Anderson", "Thomson", "McKenzie", "Campbell", "Scott", "Murray", "Stewart", "Hunter", "Ross", "Fitzgerald", "O'Connor", "Lawrence", "Hamilton"],
    },
    { // Maori
      first: ["Tane", "Rawiri", "Hemi", "Wiremu", "Manu", "Kauri", "Aroha", "Mere", "Ngaio", "Aria", "Moana", "Tui", "Kahu", "Rangi", "Hana", "Maia", "Nikau", "Tama", "Anahera"],
      last: ["Ngata", "Parata", "Tamihana", "Henare", "Pomare", "Kereama", "Whaanga", "Tipene", "Rewi", "Ruka", "Karaka", "Heke", "Paewai", "Haami", "Wiki", "Eruera", "Ihaka", "Huata"],
    },
  ],
  "south-africa": [
    { // Afrikaans
      first: ["Pieter", "Hennie", "Johan", "Francois", "Gerhard", "Willem", "Riaan", "Wiaan", "Anika", "Elmarie", "Annelie", "Charl", "Dewald", "Ruan", "Zander", "Marietjie", "Karien", "Janneman", "Tiaan", "Christelle"],
      last: ["van der Merwe", "Botha", "Pretorius", "du Plessis", "Nel", "Venter", "Steyn", "Kruger", "Joubert", "Coetzee", "Swanepoel", "Marais", "Bezuidenhout", "Fourie", "Viljoen", "Roux", "Louw", "Smit", "Meyer"],
    },
    { // English South African
      first: ["Ryan", "Jared", "Craig", "Dylan", "Kyle", "Tegan", "Kayla", "Lauren", "Megan", "Brett", "Grant", "Leigh", "Courtney", "Jade"],
      last: ["Smith", "Jones", "Walker", "Taylor", "Clarke", "Harrison", "Mitchell", "Murray", "Stewart", "Bennett", "Hughes", "Dawson", "Fraser", "Pearce", "Collins"],
    },
    { // Zulu, Xhosa, Sotho, Tswana and other Black South African
      first: ["Sipho", "Thando", "Lindiwe", "Naledi", "Kagiso", "Themba", "Zanele", "Thabo", "Nomvula", "Mandla", "Bongani", "Nokuthula", "Tumelo", "Palesa", "Siyabonga", "Lerato", "Andile", "Busisiwe", "Sibusiso", "Khanyisile"],
      last: ["Dlamini", "Nkosi", "Mokoena", "Khumalo", "Ndlovu", "Mahlangu", "Zulu", "Mthembu", "Sithole", "Molefe", "Mabaso", "Cele", "Ngcobo", "Mkhize", "Radebe", "Tshabalala", "Maseko", "Mazibuko", "Shabalala", "Zwane"],
    },
    { // Indian South African
      first: ["Pravin", "Kavita", "Preshen", "Ashwin", "Nirvan", "Devika", "Reshma", "Yashin", "Thiru", "Shaun", "Vanessa", "Rishi"],
      last: ["Naidoo", "Pillay", "Govender", "Moodley", "Reddy", "Chetty", "Maharaj", "Singh", "Ramlall", "Padayachee", "Gounden", "Pather", "Sooklal"],
    },
    { // Cape Malay and Coloured South African
      first: ["Faiez", "Zaahier", "Ebrahim", "Fatima", "Shaheed", "Yusuf", "Aaliyah", "Cassiem", "Riyaad", "Zubeida", "Gadija", "Ashraf", "Dawood", "Shireen"],
      last: ["Abrahams", "Adams", "Davids", "Jacobs", "Isaacs", "Daniels", "Petersen", "Samuels", "Hendricks", "Arendse", "Solomons", "Abdullah", "Hassan", "Jardine", "Fortuin"],
    },
  ],
  caribbean: [
    { // Afro-Caribbean
      first: ["Jason", "Darren", "Nicholas", "Marlon", "Rashad", "Tyrone", "Delroy", "Kirk", "Omari", "Akeem", "Jahmar", "Dwayne", "Kerwin", "Shanice", "Tishana", "Keisha", "Chedean", "Shemaine", "Aaliyah", "Stafanie", "Deandra", "Zahara"],
      last: ["Williams", "Joseph", "Thomas", "Lewis", "Charles", "Edwards", "Phillip", "Harris", "Daniel", "Alexander", "Francis", "Baptiste", "Bishop", "Clarke", "Greaves", "Haynes", "Cumberbatch", "Alleyne", "Springer", "Forde", "Boyce", "Henry", "Gibson", "Gordon", "Reid", "Campbell", "Bailey"],
    },
    { // Indo-Caribbean
      first: ["Devendra", "Rajesh", "Anil", "Vishal", "Navin", "Sunil", "Kavita", "Priya", "Anisa", "Reshma", "Rishi", "Ravi", "Dinesh"],
      last: ["Ramdin", "Persaud", "Ramsaroop", "Samaroo", "Ramnarine", "Mohammed", "Singh", "Maharaj", "Seepersad", "Ramlogan", "Gopaul", "Rampersad", "Bissoon", "Dookie", "Sookram"],
    },
  ],
  zimbabwe: [
    {
      first: ["Tendai", "Tatenda", "Farai", "Rudo", "Chipo", "Tinashe", "Blessing", "Tafadzwa", "Kudzai", "Nyasha", "Rufaro", "Munashe", "Vimbai", "Tapiwa", "Panashe", "Thandiwe", "Sibusiso", "Nomsa", "Bongani", "Themba", "Lindani", "Ruvimbo"],
      last: ["Moyo", "Ncube", "Dube", "Sibanda", "Mutasa", "Chikore", "Ndlovu", "Makoni", "Gumbo", "Tshuma", "Zhuwao", "Mhlanga", "Mudzimu", "Nyathi", "Chirwa", "Marufu", "Mapfumo", "Hove", "Madondo", "Shumba", "Sithole"],
    },
  ],
};

export const CITIES: Record<Region, readonly string[]> = {
  "south-asia": ["Mumbai", "Kolkata", "Chennai", "Bengaluru", "Hyderabad", "Jaipur", "Pune", "Lahore", "Karachi", "Multan", "Peshawar", "Rawalpindi", "Islamabad", "Quetta", "Dhaka", "Chattogram", "Sylhet", "Rajshahi", "Colombo", "Kandy", "Galle", "Jaffna", "Kathmandu", "Pokhara"],
  "uk-ireland": ["London", "Manchester", "Leeds", "Birmingham", "Nottingham", "Bristol", "Cardiff", "Swansea", "Glasgow", "Edinburgh", "Belfast", "Dublin", "Cork", "Durham", "Southampton", "Leicester", "Worcester", "Taunton", "Canterbury", "Chelmsford", "Aberdeen", "Galway"],
  afghanistan: ["Kabul", "Kandahar", "Herat", "Mazar-i-Sharif", "Jalalabad", "Kunduz", "Khost", "Ghazni", "Lashkar Gah", "Bamyan", "Farah", "Paktia"],
  anz: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Hobart", "Canberra", "Darwin", "Geelong", "Cairns", "Townsville", "Auckland", "Wellington", "Christchurch", "Dunedin", "Hamilton", "Napier", "Nelson", "Queenstown", "Tauranga", "Whangarei"],
  "south-africa": ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Bloemfontein", "Gqeberha", "Kimberley", "Paarl", "Potchefstroom", "Polokwane", "East London", "Pietermaritzburg", "Stellenbosch", "Soweto", "Centurion"],
  caribbean: ["Kingston", "Bridgetown", "Port of Spain", "Georgetown", "St John's", "Basseterre", "Castries", "Kingstown", "Roseau", "St George's", "Montego Bay", "Nassau", "San Fernando", "Spanish Town", "Scarborough"],
  zimbabwe: ["Harare", "Bulawayo", "Mutare", "Gweru", "Kwekwe", "Masvingo", "Victoria Falls", "Chinhoyi", "Kadoma", "Chitungwiza"],
};

/**
 * Mascots. Deliberately avoids nicknames of well-known real franchises (Sixers,
 * Scorchers, Royals, Kings, Knights, Lions, Titans, Outlaws, ...), so a
 * "<City> <Mascot>" is unlikely to match a real club.
 */
export const MASCOTS: readonly string[] = [
  "Falcons", "Wolves", "Dragons", "Rangers", "Comets", "Foxes", "Phantoms", "Kestrels", "Drifters", "Embers",
  "Harriers", "Mariners", "Pioneers", "Raptors", "Sentinels", "Vipers", "Jaguars", "Panthers", "Mongooses", "Rhinos",
  "Leopards", "Herons", "Pelicans", "Stingrays", "Barracudas", "Eagles", "Hawks", "Otters", "Badgers", "Stallions",
  "Mustangs", "Pirates", "Spartans", "Nomads", "Monarchs", "Mavericks", "Vanguards", "Cyclones", "Tempests",
  "Avalanche", "Blaze", "Lynx", "Ospreys", "Kingfishers", "Marlins", "Wildcats", "Cheetahs", "Bison", "Condors", "Wombats",
];

const HOME_SHARE = 0.85;

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function regionId(rng: Rng): Region {
  return pick(rng, REGIONS).id;
}

/** "<City> <Mascot>", the city from `region` (any region if omitted). */
export function generateTeamName(rng: Rng, region?: Region): string {
  const r = region ?? regionId(rng);
  return `${pick(rng, CITIES[r])} ${pick(rng, MASCOTS)}`;
}

/** One "First Last" name from a single region. */
function playerName(rng: Rng, region: Region): string {
  const g = pick(rng, NAME_GROUPS[region]);
  return `${pick(rng, g.first)} ${pick(rng, g.last)}`;
}

/**
 * Distinct "First Last" names. With a `home` region, most players come from it
 * and the rest are overseas signings from other regions; without one, every
 * player's region is random.
 */
export function generatePlayerNames(rng: Rng, count = 11, home?: Region): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let guard = 0; names.length < count && guard < count * 200; guard++) {
    const region = home && rng() < HOME_SHARE ? home : regionId(rng);
    const n = playerName(rng, region);
    if (seen.has(n)) continue;
    seen.add(n);
    names.push(n);
  }
  return names;
}

/** A complete team from one region (or a random one for "world"). The same Rng always gives the same team. */
export function generateTeam(rng: Rng, choice: RegionChoice = "world"): Team {
  const region = choice === "world" ? regionId(rng) : choice;
  return makeTeam(generateTeamName(rng, region), generatePlayerNames(rng, 11, region));
}

/**
 * `count` generated teams with distinct names (and none in `taken`), each with a
 * random strength 0-5. For "world" every team picks its own region, so a league
 * is a mix; for a single region the whole league is from there. Strength only
 * matters in competitions that turn it on. The same Rng always gives the same
 * teams, ids included.
 */
export function generateTeams(
  rng: Rng,
  count: number,
  taken: ReadonlySet<string> = new Set(),
  choice: RegionChoice = "world",
): Team[] {
  const teams: Team[] = [];
  const names = new Set(taken);
  let collisions = 0;
  while (teams.length < count) {
    const region = choice === "world" ? regionId(rng) : choice;
    let name = generateTeamName(rng, region);
    if (names.has(name)) {
      // Plenty of distinct names exist for normal leagues. For huge cups they run
      // out, so after a few clashes fall back to a numbered name, e.g. "Kabul Hawks 2".
      if (++collisions < 30) continue;
      let k = 2;
      while (names.has(`${name} ${k}`)) k++;
      name = `${name} ${k}`;
    }
    names.add(name);
    const id = `t-g-${Math.floor(rng() * 1e9).toString(36)}-${teams.length}`;
    teams.push(makeTeam(name, generatePlayerNames(rng, 11, region), id, Math.floor(rng() * 6)));
  }
  return teams;
}
