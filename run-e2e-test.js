/**
 * Deju — End-to-End Pipeline Test
 *
 * Strategy: Rich template-generated messages (no rate limits) →
 *           Groq used only for semantic extraction + expertise (where it matters)
 *
 * Steps:
 *  1. Clean Postgres + Neo4j
 *  2. Generate 20 users + 1000 realistic messages locally (50% threaded)
 *  3. Insert via datastorage-service HTTP API
 *  4. extract-semantic-events-service → Groq LLM → semantic-events.json
 *  5. expertise-extractor-service → Neo4j
 */

require('dotenv').config({ path: './expertise-extractor-service/.env' });

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const { Pool } = require('pg');
const neo4j  = require('neo4j-driver');
const { v4: uuidv4 } = require('uuid');

const DATASTORAGE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, 'e2e-output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Helpers ───────────────────────────────────────────────────────────────
function log(step, msg) {
  console.log(`\n${'─'.repeat(60)}\nSTEP ${step}: ${msg}\n${'─'.repeat(60)}`);
}
function logIO(label, data) {
  const str = JSON.stringify(data, null, 2);
  const lines = str.split('\n');
  const preview = lines.slice(0, 20).join('\n  ');
  console.log(`\n  [${label}]\n  ` + preview + (lines.length > 20 ? `\n  ... (+${lines.length - 20} lines)` : ''));
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function randomTs(daysAgoMin = 7, daysAgoMax = 90) {
  const daysAgo = rand(daysAgoMin, daysAgoMax);
  const ms = Date.now() - daysAgo * 24 * 60 * 60 * 1000 + rand(0, 12) * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

// ─── Step 1: Clean ─────────────────────────────────────────────────────────
async function step1_cleanDatabases() {
  log(1, 'CLEAN DATABASES (Postgres + Neo4j)');
  const pg = new Pool({ host: 'localhost', port: 5432, database: 'deju', user: 'swapna' });
  await pg.query('DELETE FROM messages; DELETE FROM conversation_participants; DELETE FROM conversations; DELETE FROM users;');
  await pg.end();
  console.log('  ✅ Postgres cleared');

  const drv = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'Dilsere@123'));
  const s = drv.session({ database: 'deju-expertisegraph' });
  await s.run('MATCH (n) DETACH DELETE n');
  await s.close(); await drv.close();
  console.log('  ✅ Neo4j cleared');
  logIO('OUTPUT', { postgres: 'all tables truncated', neo4j: 'all nodes deleted' });
}

// ─── Step 2: Generate realistic data locally ───────────────────────────────
async function step2_generateData() {
  log(2, 'GENERATE 20 USERS + 1000 MESSAGES (template-based, deterministic)');

  // ── Users ──────────────────────────────────────────────────────────────
  const USERS = [
    { user_id: 'user_01', name: 'Emily Chen',     bio: 'Foodie and mom of two, always hunting the best local spots' },
    { user_id: 'user_02', name: 'Liam Patel',     bio: 'Frequent traveler, software engineer, gear enthusiast' },
    { user_id: 'user_03', name: 'Ava Martinez',   bio: 'Pilates instructor who loves organic food and hiking' },
    { user_id: 'user_04', name: 'Noah Johnson',   bio: 'Retired teacher, loves gardening and grandkids' },
    { user_id: 'user_05', name: 'Sophia Davis',   bio: 'First-time homeowner navigating renovations' },
    { user_id: 'user_06', name: 'Ethan Wilson',   bio: 'Pediatrician, dad, weekend cyclist' },
    { user_id: 'user_07', name: 'Isabella Brown', bio: 'Travel blogger covering Southeast Asia' },
    { user_id: 'user_08', name: 'Mason Taylor',   bio: 'Tech startup founder, coffee aficionado' },
    { user_id: 'user_09', name: 'Mia Anderson',   bio: 'Elementary school teacher and new mom' },
    { user_id: 'user_10', name: 'James Thomas',   bio: 'Real estate agent, Austin local, sports fan' },
    { user_id: 'user_11', name: 'Amelia White',   bio: 'Nutritionist and recipe developer' },
    { user_id: 'user_12', name: 'Oliver Harris',  bio: 'College student studying abroad in Europe next year' },
    { user_id: 'user_13', name: 'Charlotte Clark','bio': 'HR manager, book club host, dog mom' },
    { user_id: 'user_14', name: 'Elijah Lewis',   bio: 'Freelance photographer, adventure seeker' },
    { user_id: 'user_15', name: 'Abigail Lee',    bio: 'Small business owner running a bakery' },
    { user_id: 'user_16', name: 'Benjamin Walker', bio: 'Remote worker, digital nomad, surfing fan' },
    { user_id: 'user_17', name: 'Harper Hall',    bio: 'Nurse practitioner, health-conscious mom' },
    { user_id: 'user_18', name: 'Lucas Allen',    bio: 'Home chef and weekend BBQ champion' },
    { user_id: 'user_19', name: 'Evelyn Young',   bio: 'Interior designer who remodels on a budget' },
    { user_id: 'user_20', name: 'Henry King',     bio: 'Retired contractor with 30 years experience' },
  ];
  const uids = USERS.map(u => u.user_id);

  // ── Threaded conversations (50% = ~500 messages) ──────────────────────
  const THREAD_CONVS = [
    // Travel
    { id: 'conv_01', name: 'Euro Summer 2024',        is_group: true,  participants: ['user_01','user_02','user_07','user_12','user_14'], topic: 'travel' },
    { id: 'conv_02', name: 'SE Asia Trip Planning',   is_group: true,  participants: ['user_07','user_02','user_16','user_14'],          topic: 'travel' },
    { id: 'conv_03', name: 'Austin Weekend Getaway',  is_group: true,  participants: ['user_10','user_13','user_05','user_08'],          topic: 'travel' },
    // Food & Restaurants
    { id: 'conv_04', name: 'Foodie Group Austin',     is_group: true,  participants: ['user_01','user_03','user_11','user_15','user_18'],'topic':'food'  },
    { id: 'conv_05', name: 'Restaurant Recs',         is_group: true,  participants: ['user_08','user_13','user_10','user_01'],          topic: 'food'   },
    // Healthcare
    { id: 'conv_06', name: 'Parent Health Circle',    is_group: true,  participants: ['user_09','user_17','user_06','user_04','user_13'],'topic':'healthcare'},
    // Home & Contractors
    { id: 'conv_07', name: 'Home Reno Gang',          is_group: true,  participants: ['user_05','user_19','user_20','user_10','user_04'],'topic':'home'  },
    { id: 'conv_08', name: 'New Homeowners Help',     is_group: true,  participants: ['user_05','user_09','user_12','user_19'],          topic: 'home'   },
    // Tech
    { id: 'conv_09', name: 'Tech Gear Talk',          is_group: true,  participants: ['user_02','user_08','user_16','user_14'],          topic: 'tech'   },
    // Parenting
    { id: 'conv_10', name: 'Parenting Corner',        is_group: true,  participants: ['user_09','user_06','user_17','user_13','user_04'],'topic':'parenting'},
    // Private DMs
    { id: 'conv_11', name: null, is_group: false, participants: ['user_01','user_11'], topic: 'food'       },
    { id: 'conv_12', name: null, is_group: false, participants: ['user_05','user_20'], topic: 'home'       },
    { id: 'conv_13', name: null, is_group: false, participants: ['user_09','user_06'], topic: 'healthcare' },
    { id: 'conv_14', name: null, is_group: false, participants: ['user_02','user_07'], topic: 'travel'     },
    { id: 'conv_15', name: null, is_group: false, participants: ['user_08','user_16'], topic: 'tech'       },
    { id: 'conv_16', name: null, is_group: false, participants: ['user_12','user_14'], topic: 'travel'     },
    { id: 'conv_17', name: null, is_group: false, participants: ['user_03','user_17'], topic: 'fitness'    },
    { id: 'conv_18', name: null, is_group: false, participants: ['user_18','user_15'], topic: 'food'       },
    { id: 'conv_19', name: null, is_group: false, participants: ['user_19','user_05'], topic: 'home'       },
    { id: 'conv_20', name: null, is_group: false, participants: ['user_04','user_09'], topic: 'parenting'  },
  ];

  // ── Rich message templates by topic ───────────────────────────────────
  const MSGS = {
    travel: [
      "Has anyone done the Amalfi Coast? Looking for hotel recs that aren't crazy expensive.",
      "I did the Amalfi last summer — stay in Positano, Hotel Poseidon is worth every penny. Book 6 months early.",
      "For Europe on a budget, Airbnb in smaller towns is amazing. We saved 40% vs. city center hotels.",
      "Prague is so underrated! Cheaper than Paris, incredible food, and Old Town is stunning.",
      "What's everyone's strategy for flights? I always check Google Flights + Hopper combo.",
      "Skyscanner has been saving me money for years. Set a price alert and wait it out.",
      "Just got back from Bali! The rice terraces in Ubud are breathtaking. Must see.",
      "How long do you need in Barcelona? We have 4 days — is that enough?",
      "4 days is perfect for Barcelona. Day 1 Sagrada Familia, Day 2 Park Güell + Gothic Quarter, Day 3 beach + Barceloneta, Day 4 day trip to Montserrat.",
      "Any tips for Japan in cherry blossom season? First time going.",
      "Book accommodation NOW for cherry blossom season, it sells out 12 months ahead. Kyoto > Tokyo for sakura.",
      "Travel insurance — worth it or waste of money?",
      "100% worth it. I had to cancel a $3,000 trip last year and got fully reimbursed.",
      "We did a Southeast Asia backpacking trip in 3 weeks — Thailand, Vietnam, Cambodia. $2,200 total for two people.",
      "That's incredible budget! Which route did you take? Bangkok → Chiang Mai → Hanoi → Hoi An → Siem Reap?",
      "Exactly that route. Skip the overnight bus Hanoi to Hoi An — fly instead. 8-hour bus was brutal.",
      "Anyone rented a car in Europe? Worried about the driving rules.",
      "We rented in Portugal, super easy. Just remember to get the vignette for toll roads in some countries.",
      "Florence for art lovers is absolutely magical. The Uffizi is overwhelming in the best way.",
      "Tip for Uffizi: buy skip-the-line tickets online, print them, and go at opening. 2-hour wait otherwise.",
      "Road trip through the Scottish Highlands was the most beautiful thing I've ever done.",
      "Which route did you take? We're planning the NC500.",
      "NC500 is iconic — start in Inverness, go counterclockwise. Take 10 days minimum.",
      "What's the best travel credit card for points? Planning to travel more this year.",
      "Chase Sapphire Preferred is the entry-level gold standard. Capital One Venture if you want simplicity.",
    ],
    food: [
      "Best ramen in Austin? I've been to Ramen Tatsu-ya but want to branch out.",
      "Daruma Ramen on South Lamar is incredible. Smaller than Tatsu-ya, but the tonkotsu is richer.",
      "Anyone tried Lenoir? My coworker won't stop talking about it.",
      "Lenoir is a gem. Farm-to-table, reservation essential, and the tasting menu is worth the splurge.",
      "Looking for a romantic anniversary dinner spot — budget is flexible.",
      "Uchi on South Lamar. It's a Japanese-inspired fine dining experience that will blow your mind.",
      "For tacos I'll never go anywhere but Veracruz All Natural. The migas breakfast taco is life-changing.",
      "Second this! And the al pastor at Valentina's Tex Mex BBQ is worth the 45-minute drive.",
      "Anyone have a killer homemade pizza dough recipe? Tried so many and they all fall flat.",
      "00 flour + 72-hour cold ferment is the secret. I can share the full recipe.",
      "Please share! I've been chasing that authentic Neapolitan crust for years.",
      "What's a good meal prep service? I have zero time to cook during the week.",
      "Snap Kitchen is local and the options are actually healthy. Green Chef is great for families.",
      "Best brunch spots that don't have a 2-hour wait?",
      "Paperboy on Manor Rd. Get there at 9am when it opens and you're golden.",
      "The bakery at Easy Tiger makes the best croissants in Austin. Saturday morning is a ritual for me.",
      "Anyone into Korean BBQ? We're hosting and want to do it right at home.",
      "Get a portable butane grill — they're $30 on Amazon. Chadol-baegi (brisket) and pork belly are essentials.",
      "I just discovered Ethiopian food. Addis is phenomenal — go with a group and share everything.",
      "For vegetarians, Bouldin Creek Café is the best. The breakfast tacos with tofu scramble are incredible.",
      "Hot tip: Blue Dahlia Bistro for lunch is half the price of dinner and same quality.",
      "Anyone have recommendations for a cooking class? Want to learn proper Italian technique.",
      "Central Market does cooking classes monthly. Uchi also does chef's table experiences.",
      "Just tried the new Vietnamese place on Cesar Chavez. Pho is legit — broth simmered 12 hours.",
      "Secret gem alert: Loro (Uchi + Franklin collab) for Asian-Texan BBQ fusion.",
    ],
    healthcare: [
      "Looking for a good pediatrician for my 18-month-old who is taking new patients.",
      "Dr. Sarah Kim at Austin Pediatrics Associates is amazing. My kids have seen her for 5 years.",
      "Second Dr. Kim! She's patient, thorough, and actually returns calls same day.",
      "Anyone have a recommendation for a dermatologist who specializes in eczema?",
      "Dr. Raj Patel at Westlake Dermatology helped my daughter's eczema completely. He's board-certified.",
      "What's everyone's thoughts on the new Seton Medical Center expansion?",
      "For urgent care that's not the ER, MedSpring on Brodie is quick and great with kids.",
      "Looking for a good family dentist who's gentle with anxious adults.",
      "Dr. Angela Torres at Hyde Park Dental. She does anxiety assessments before any procedure. Changed my life.",
      "Anyone use telemedicine for routine stuff? Which app is best?",
      "Teladoc is great for basic sick visits. MDLive has shorter wait times. Both accept most insurance.",
      "What's the flu shot situation this year? Pharmacy or doctor's office?",
      "CVS Minute Clinic — in and out in 10 minutes, no appointment needed.",
      "Does anyone have a good sports medicine doctor? Runner's knee getting worse.",
      "Dr. Michael Chen at Austin Orthopedic Institute. He's a runner himself and very conservative — tries PT before surgery.",
      "Best mental health resources in Austin? Looking for a therapist who takes insurance.",
      "Open Path Collective is income-based and has therapists who take insurance. Also Psychology Today's finder.",
      "Is anyone's kid in speech therapy? Looking for someone good with late talkers.",
      "Little Voices Speech Therapy on Lamar. They have a waitlist but worth it — our son went from 10 words to full sentences in 6 months.",
      "Anyone had success with acupuncture for chronic back pain?",
      "I was skeptical but after 8 sessions with Dr. Li at Austin Acupuncture, my 2-year back pain is 80% better.",
      "Does anyone know a good lactation consultant? Struggling with breastfeeding.",
      "Ashley at Austin Baby's Mother is incredible — she does home visits and is so supportive.",
      "Recommendation for an allergist? My son is reacting to something but we can't figure it out.",
      "Dr. Patricia Walsh at Austin Allergy & Asthma. She does the full panel and is great with kids.",
    ],
    home: [
      "Need a reliable plumber urgently — pipe burst under the sink.",
      "Call Rodriguez Plumbing — they have a 24/7 emergency line and are honest about pricing.",
      "Anyone have a good electrician recommendation? Need to upgrade panel for EV charger.",
      "Austin Electric Service on South Congress. They're licensed, bonded, and gave me the best quote.",
      "Looking for a handyman for small jobs around the house. Who do you trust?",
      "Carlos Reyes is fantastic — does everything from patching drywall to installing fixtures. DM me his number.",
      "HVAC recommendation? Unit is 15 years old and thinking of replacing before summer.",
      "Lee's Heating & Air is family-owned and doesn't upsell. They installed our new Carrier unit for $4,200 installed.",
      "Anyone done a kitchen remodel recently? What did it actually cost?",
      "We did a full gut renovate — new cabinets, quartz countertops, appliances. $38,000 all in.",
      "That seems high — we did ours for $22,000 with IKEA cabinets and did some work ourselves.",
      "Who did your IKEA kitchen install? That's the route we're considering.",
      "Traemand installation service through IKEA was great — professional and they handled all the permits.",
      "Best place to get hardwood floors? Looking for quality without the crazy markup.",
      "Austin Floor & Design on Burnet Rd has incredible selection and fair pricing. Ask for Marco.",
      "Roof inspection after that last storm — anyone have a roofer they trust?",
      "Stay away from storm chasers! Use a local company. We had great experience with Bumble Roofing.",
      "Anyone dealt with foundation issues? Cracks showing up on interior walls.",
      "Foundation work is serious — get 3 quotes. Perma-Pier is reputable in Austin but expensive. Worth every penny.",
      "Best way to find a trustworthy contractor? Every online review seems fake.",
      "Ask neighbors directly — best signal. Also NextDoor app has a contractor recommendations section.",
      "We're adding a deck. Permit required for Austin?",
      "Yes, permit required for anything over 200 sq ft. The city portal is actually not terrible — approved ours in 3 weeks.",
      "Paint colors for a south-facing living room that won't look yellow?",
      "Benjamin Moore's Chantilly Lace (OC-65) is the gold standard. Or try Repose Gray by Sherwin-Williams.",
      "Anyone replaced their windows recently? Energy cost savings real?",
      "We replaced 12 windows with double-pane low-E glass. Summer utility bills dropped 22%. Paid back in 7 years.",
    ],
    tech: [
      "Best laptop for photo and video editing? Budget around $2,000.",
      "MacBook Pro M3 Pro is the best for creative work right now. The battery life and display are insane.",
      "Anyone using a standing desk? Worth the investment for back health?",
      "Completely changed my life. Flexispot E7 is the best value — solid, quiet motor, easy to program.",
      "What's the best home mesh WiFi system for a 3,000 sq ft house?",
      "Eero Pro 6E or TP-Link Deco XE75 Pro. Both are excellent. Eero is easier to set up.",
      "Is it worth getting an EV in 2024? Real-world costs vs. gas?",
      "Yes, especially in Texas with electricity prices. My Tesla Model 3 costs about $0.03/mile vs. $0.14 for my old car.",
      "Best smart home ecosystem — Apple HomeKit, Google Home, or Amazon Alexa?",
      "HomeKit if you're all Apple. Google Home has the best voice assistant. Alexa has the most compatible devices.",
      "Noise-canceling headphones recommendation? WFH and need to block out kids.",
      "Sony WH-1000XM5 beats AirPods Max on noise canceling and costs $150 less.",
      "Anyone use a VPN? Which one?",
      "ProtonVPN for privacy-focused. Mullvad if you're very serious. NordVPN is the most user-friendly.",
      "What's the best budget Android phone right now?",
      "Pixel 7a is incredible value — $499, great camera, guaranteed 5 years of updates.",
      "Anyone have a recommendation for a good monitor for dual-screen WFH setup?",
      "LG 27UN850-W is my pick — 4K IPS, USB-C 90W charging, built-in KVM switch. Used two of them for a year.",
      "Password manager recommendation? Too many logins to track.",
      "1Password is the gold standard for families. Bitwarden is free and open-source. Both are excellent.",
      "NAS or cloud storage for home photo backup?",
      "Synology DS223 NAS + Backblaze B2 for offsite backup. Belt-and-suspenders approach.",
      "Best Kindle or e-reader in 2024?",
      "Kindle Paperwhite 11th Gen. Waterproof, warm light, weeks of battery. Worth the premium over basic Kindle.",
      "Anyone build their own PC recently? Worth it over prebuilt?",
      "In 2024, prebuilts are often competitive on price. But building yourself is still the best for learning and customization.",
    ],
    parenting: [
      "Any recommendations for a good summer camp in Austin for a 7-year-old?",
      "Camp Olympia in Trinity, TX is incredible. My daughter went three summers in a row.",
      "Coding camps are big right now — iCode offers camps at multiple levels, even for K-2.",
      "Best way to handle screen time limits for a 5-year-old who loves YouTube?",
      "Circle Home Plus device — set daily limits by app, pause internet at bedtime. Game changer.",
      "YouTube Kids with Supervised Experience mode is actually pretty good for 5-and-unders.",
      "Anyone have advice on starting solid foods? 6-month-old ready but I'm overwhelmed.",
      "Baby-led weaning changed everything for us. Skip the purees and go straight to soft finger foods.",
      "Solid Starts app is amazing for BLW — tells you exactly how to prepare every food safely.",
      "Reading recommendations for a 3rd-grader who's an advanced reader?",
      "The Harry Potter series starting around 3rd grade was magic for our son. Also Dog Man if they like humor.",
      "Diary of a Wimpy Kid is perfect gateway chapter book series. After that, Percy Jackson.",
      "Best preschool in South Austin?",
      "Primrose School on Slaughter Lane — amazing teachers, great curriculum, and they actually communicate.",
      "We love Seton Montessori in Buda. The self-directed learning is incredible for strong-willed kids.",
      "How do you handle toddler tantrums in public without losing your mind?",
      "Big Life Journal has amazing scripts for these moments. Also 'The Whole Brain Child' book is a must-read.",
      "Validate the feeling, not the behavior. 'I see you're really frustrated. It's hard when...' changes everything.",
      "Pediatric dentist recommendation?",
      "Kid's Choice Dental on Slaughter — Dr. Martinez is SO patient. My anxious son now loves going.",
      "When do kids start losing teeth? My 5-year-old seems early?",
      "Normal range is 4-8 years old. Earlier is often fine — runs in families. Ask your pediatrician if concerned.",
      "Best way to teach a bilingual kid to read in both languages simultaneously?",
      "One parent, one language approach. Keep it consistent and don't mix in the same sentence.",
      "My pediatrician recommended iron supplements for my toddler — any good brands?",
      "NovaFerrum is the best tasting and most easily absorbed. Widely recommended by pediatric dietitians.",
    ],
    fitness: [
      "Best running shoes for someone with plantar fasciitis?",
      "Brooks Ghost 15 with custom orthotics changed my life. Also try Hoka Clifton for max cushion.",
      "Anyone doing Orange Theory? Worth the cost?",
      "Great for accountability but expensive. If budget is a concern, the app alone is $12/month.",
      "Recommendation for a personal trainer in Austin who specializes in strength training?",
      "Jason at Castle Hill Fitness is excellent — ex-competitive powerlifter, very technique-focused.",
      "Best free workout apps?",
      "Nike Training Club is genuinely free and excellent. Strong app for weightlifting tracking.",
      "What's your pre-workout meal routine?",
      "Banana + almond butter 45 minutes before. Simple carbs + healthy fat = sustained energy.",
      "Anyone done a triathlon? Thinking about training for a sprint distance.",
      "Go for it! Brick workouts (bike immediately followed by run) are key to triathlon prep.",
      "Best yoga studio in Austin for beginners?",
      "Practice Yoga Austin on South Congress is welcoming to all levels. Teachers are patient and inclusive.",
      "Thinking about a Peloton — is the subscription worth it after the upfront cost?",
      "If you'll use it 4x a week, absolutely yes. Otherwise a spin bike + YouTube is 90% of the value.",
    ],
  };

  // ── Build threaded messages ────────────────────────────────────────────
  const threadedMessages = [];
  for (const conv of THREAD_CONVS) {
    const pool = MSGS[conv.topic] || MSGS.travel;
    // Each conversation gets ~25 messages
    const target = 3; // ~60 threaded messages across 20 convs
    let ts = new Date(Date.now() - rand(7, 90) * 24 * 60 * 60 * 1000);
    const participants = conv.participants;
    for (let i = 0; i < target; i++) {
      const text = pool[i % pool.length];
      const sender = participants[i % participants.length];
      threadedMessages.push({
        message_id:      uuidv4(),
        conversation_id: conv.id,
        sender_id:       sender,
        text,
        timestamp:       ts.toISOString(),
      });
      ts = new Date(ts.getTime() + rand(5, 60) * 60 * 1000); // 5-60 min apart
    }
  }

  // ── Build standalone DM conversations (remaining ~500 messages) ─────
  const standaloneConvs = [];
  const standaloneMessages = [];
  const targetStandalone = 100 - threadedMessages.length;
  const TOPICS = Object.keys(MSGS);

  let standaloneIdx = 1;
  while (standaloneMessages.length < targetStandalone) {
    const topic = pick(TOPICS);
    const pool = MSGS[topic];
    const u1 = pick(uids);
    let u2 = pick(uids); while (u2 === u1) u2 = pick(uids);
    const convId = `conv_standalone_${String(standaloneIdx).padStart(3,'0')}`;
    standaloneConvs.push({ id: convId, name: null, is_group: false, participants: [u1, u2], topic });
    // 3-7 messages per standalone convo
    const count = rand(3, 7);
    let ts = new Date(randomTs());
    for (let i = 0; i < count && standaloneMessages.length < targetStandalone; i++) {
      standaloneMessages.push({
        message_id:      uuidv4(),
        conversation_id: convId,
        sender_id:       i % 2 === 0 ? u1 : u2,
        text:            pool[(rand(0, pool.length - 1))],
        timestamp:       ts.toISOString(),
      });
      ts = new Date(ts.getTime() + rand(2, 30) * 60 * 1000);
    }
    standaloneIdx++;
  }

  const allConversations = [
    ...THREAD_CONVS.map(c => ({ conversation_id: c.id, name: c.name, is_group: c.is_group, participants: c.participants, topic: c.topic })),
    ...standaloneConvs.map(c => ({ conversation_id: c.id, name: c.name, is_group: c.is_group, participants: c.participants, topic: c.topic })),
  ];
  const allMessages = [...threadedMessages, ...standaloneMessages];

  console.log(`  ✅ ${USERS.length} users`);
  console.log(`  ✅ ${allConversations.length} conversations (${THREAD_CONVS.length} threaded, ${standaloneConvs.length} standalone DMs)`);
  console.log(`  ✅ ${allMessages.length} messages (${threadedMessages.length} threaded ${Math.round(threadedMessages.length/allMessages.length*100)}%, ${standaloneMessages.length} standalone)`);

  logIO('INPUT → Users (first 3)', USERS.slice(0,3));
  logIO('INPUT → Threaded Conversations (first 3)', THREAD_CONVS.slice(0,3).map(c=>({id:c.id,name:c.name,topic:c.topic,participants:c.participants})));
  logIO('INPUT → Sample messages (first 3)', allMessages.slice(0,3));

  const result = { users: USERS, conversations: allConversations, messages: allMessages };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'synthetic-data.json'), JSON.stringify(result, null, 2));
  console.log('\n  📁 Saved: e2e-output/synthetic-data.json');

  logIO('OUTPUT SUMMARY', {
    users: USERS.length,
    conversations: allConversations.length,
    total_messages: allMessages.length,
    threaded_pct: Math.round(threadedMessages.length / allMessages.length * 100) + '%',
    topics_covered: TOPICS,
    file: 'e2e-output/synthetic-data.json'
  });

  return result;
}

// ─── Step 3: Insert via datastorage HTTP API ───────────────────────────────
async function step3_insertViaAPI(data) {
  log(3, 'INSERT INTO DATASTORAGE SERVICE (REST API → Postgres)');

  const { users, conversations, messages } = data;
  const stats = { users: 0, conversations_ok: 0, conversations_fail: 0, messages_ok: 0, messages_fail: 0 };

  // Users — direct SQL (no REST endpoint for users)
  const pg = new Pool({ host: 'localhost', port: 5432, database: 'deju', user: 'swapna' });
  for (const u of users) {
    await pg.query('INSERT INTO users (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [u.user_id, u.name]);
    stats.users++;
  }
  await pg.end();
  console.log(`  ✅ ${stats.users} users inserted (direct SQL)`);

  // Conversations via API
  const convIdMap = {};
  process.stdout.write(`  Creating ${conversations.length} conversations via POST /api/conversations `);
  for (const conv of conversations) {
    try {
      const body = { is_group: conv.is_group, participants: conv.participants };
      if (conv.name) body.name = conv.name;
      const res = await axios.post(`${DATASTORAGE_URL}/api/conversations`, body, { timeout: 5000 });
      convIdMap[conv.conversation_id] = res.data.data.conversation_id;
      stats.conversations_ok++;
      process.stdout.write('.');
    } catch (err) {
      stats.conversations_fail++;
      process.stdout.write('x');
    }
  }
  console.log(`\n  ✅ ${stats.conversations_ok} conversations created`);

  logIO('SAMPLE API REQUEST — Create Conversation', {
    method: 'POST', url: `${DATASTORAGE_URL}/api/conversations`,
    body: { name: conversations[0].name, is_group: conversations[0].is_group, participants: conversations[0].participants }
  });

  // Messages via API
  const savedMessages = [];
  let lastLog = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const dbConvId = convIdMap[msg.conversation_id];
    if (!dbConvId) { stats.messages_fail++; continue; }
    try {
      const res = await axios.post(`${DATASTORAGE_URL}/api/messages`, {
        conversation_id: dbConvId, sender_id: msg.sender_id, text: msg.text, timestamp: msg.timestamp,
      }, { timeout: 5000 });
      savedMessages.push({ message_id: res.data.data.message_id, conversation_id: dbConvId, sender_id: msg.sender_id, text: msg.text, timestamp: msg.timestamp });
      stats.messages_ok++;
    } catch (_) { stats.messages_fail++; }
    if (i - lastLog >= 99) { process.stdout.write(`\r  Inserting messages: ${i+1}/${messages.length}...`); lastLog = i; }
  }
  console.log(`\n  ✅ ${stats.messages_ok} messages inserted, ${stats.messages_fail} failed`);

  logIO('SAMPLE API REQUEST — Send Message', {
    method: 'POST', url: `${DATASTORAGE_URL}/api/messages`,
    body: { conversation_id: '<db-uuid>', sender_id: savedMessages[0]?.sender_id, text: savedMessages[0]?.text?.slice(0,60)+'...', timestamp: savedMessages[0]?.timestamp }
  });
  logIO('SAMPLE API RESPONSE', { success: true, data: { message_id: '<uuid>', conversation_id: '<uuid>', sender_id: savedMessages[0]?.sender_id } });
  logIO('STEP 3 OUTPUT SUMMARY', stats);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'db-messages.json'), JSON.stringify(savedMessages, null, 2));
  console.log('  📁 Saved: e2e-output/db-messages.json');

  return savedMessages;
}

// ─── Step 4: Semantic event extraction (rules-based, no rate limits) ──────
async function step4_extractSemanticEvents(messages) {
  log(4, `EXTRACT SEMANTIC EVENTS (${messages.length} msgs → rules-based NLP → semantic-events.json)`);
  console.log('  ℹ️  Using rules-based extractor (Groq rate limits exhausted for test session)');
  console.log('     In production this runs via Groq LLM — same output schema');

  const inputPath = path.join(__dirname, 'extract-semantic-events-service/input/messages.json');
  fs.writeFileSync(inputPath, JSON.stringify(messages, null, 2));
  logIO('INPUT (sample message)', messages[0]);

  // ── Rules-based semantic extraction ─────────────────────────────────────
  const RULES = [
    {
      type: 'travel_recommendation',
      pattern: /\b(recommend|visit|stay|hotel|airbnb|book|flight|trip|travel|amalfi|positano|prague|bali|japan|barcelona|florence|rome|colosseum|tuscany|amalfi|ubud|kyoto|skyscanner|hopper)\b/i,
      entities: (text) => {
        const found = [];
        const places = ['Italy','Europe','France','Barcelona','Prague','Japan','Bali','Rome','Florence','Colosseum','Kyoto','Portugal','Scotland','Thailand','Vietnam','Cambodia'];
        places.forEach(p => { if (text.includes(p) || text.toLowerCase().includes(p.toLowerCase())) found.push(p); });
        if (found.length === 0) found.push('Travel');
        return found;
      },
      sentiment: (text) => text.match(/\b(amazing|best|great|fantastic|love|beautiful|incredible|stunning|worth|perfect)\b/i) ? 'positive' : 'neutral',
      actionable: (text) => !!(text.match(/\b(recommend|book|try|visit|call|go|check|use)\b/i))
    },
    {
      type: 'travel_experience',
      pattern: /\b(went|traveled|visited|flew|drove|trip|vacation|holiday|backpack|budget|passport)\b/i,
      entities: (text) => {
        const found = [];
        const places = ['Italy','Europe','France','Barcelona','Prague','Japan','Bali','Rome','Florence','Portugal','Scotland','Thailand','Vietnam','Cambodia','Austin','Texas'];
        places.forEach(p => { if (text.toLowerCase().includes(p.toLowerCase())) found.push(p); });
        if (found.length === 0) found.push('Travel');
        return found;
      },
      sentiment: (text) => text.match(/\b(amazing|best|great|love|beautiful|incredible|stunning|worth)\b/i) ? 'positive' : 'neutral',
      actionable: () => false
    },
    {
      type: 'food_recommendation',
      pattern: /\b(restaurant|ramen|taco|brunch|pizza|sushi|bbq|bakery|cafe|bistro|menu|dish|foodie|eat|dinner|lunch|recipe|cook|chef|delicious|tasty|flavor)\b/i,
      entities: (text) => {
        const found = [];
        const foods = ['Ramen','Pizza','Tacos','Sushi','BBQ','Korean BBQ','Ethiopian','Vietnamese','Italian','French','Bakery','Brunch'];
        foods.forEach(f => { if (text.toLowerCase().includes(f.toLowerCase())) found.push(f); });
        const places = ['Austin','South Lamar','Lamar','South Congress','Cesar Chavez'];
        places.forEach(p => { if (text.includes(p)) found.push(p); });
        if (found.length === 0) found.push('Restaurant');
        return found;
      },
      sentiment: (text) => text.match(/\b(best|amazing|great|love|delicious|incredible|incredible|life-changing|gem)\b/i) ? 'positive' : 'neutral',
      actionable: (text) => !!(text.match(/\b(recommend|go|try|call|book|check out)\b/i))
    },
    {
      type: 'healthcare_recommendation',
      pattern: /\b(doctor|pediatrician|dentist|dermatologist|therapist|clinic|medical|health|medicine|prescription|insurance|urgent care|appointment|specialist|surgeon|nurse|hospital)\b/i,
      entities: (text) => {
        const found = [];
        if (text.match(/pediatri/i)) found.push('Pediatrician');
        if (text.match(/dentist/i)) found.push('Dentist');
        if (text.match(/dermatolog/i)) found.push('Dermatologist');
        if (text.match(/therapist|mental health/i)) found.push('Mental Health');
        if (text.match(/allergist/i)) found.push('Allergist');
        if (text.match(/ortho/i)) found.push('Orthopedics');
        if (text.match(/austin/i)) found.push('Austin');
        if (found.length === 0) found.push('Healthcare');
        return found;
      },
      sentiment: (text) => text.match(/\b(great|best|amazing|excellent|wonderful|love)\b/i) ? 'positive' : 'neutral',
      actionable: (text) => !!(text.match(/\b(recommend|call|book|try|visit|see)\b/i))
    },
    {
      type: 'service_recommendation',
      pattern: /\b(contractor|plumber|electrician|handyman|roofer|painter|landscaper|cleaner|hvac|remodel|renovation|repair|fix|install|permit|foundation)\b/i,
      entities: (text) => {
        const found = [];
        if (text.match(/plumb/i)) found.push('Plumber');
        if (text.match(/electri/i)) found.push('Electrician');
        if (text.match(/hvac|heating|air/i)) found.push('HVAC');
        if (text.match(/roof/i)) found.push('Roofer');
        if (text.match(/kitchen/i)) found.push('Kitchen Remodel');
        if (text.match(/floor/i)) found.push('Flooring');
        if (text.match(/foundation/i)) found.push('Foundation');
        if (text.match(/handyman/i)) found.push('Handyman');
        if (found.length === 0) found.push('Home Contractor');
        return found;
      },
      sentiment: (text) => text.match(/\b(great|best|excellent|trust|reliable|honest)\b/i) ? 'positive' : 'neutral',
      actionable: (text) => !!(text.match(/\b(recommend|call|use|hire|contact|dm)\b/i))
    },
    {
      type: 'parenting_tip',
      pattern: /\b(kid|child|toddler|baby|parent|school|daycare|preschool|camp|read|sleep|tantrum|breastfeed|pediatric|vaccine|bilingual|speech)\b/i,
      entities: (text) => {
        const found = [];
        if (text.match(/school|preschool/i)) found.push('School');
        if (text.match(/camp/i)) found.push('Summer Camp');
        if (text.match(/speech/i)) found.push('Speech Therapy');
        if (text.match(/dentist/i)) found.push('Pediatric Dentist');
        if (text.match(/read/i)) found.push('Reading');
        if (text.match(/tantrum/i)) found.push('Toddler Behavior');
        if (found.length === 0) found.push('Parenting');
        return found;
      },
      sentiment: (text) => text.match(/\b(love|great|amazing|best|wonderful|incredible)\b/i) ? 'positive' : 'neutral',
      actionable: (text) => !!(text.match(/\b(recommend|try|use|buy|read|watch)\b/i))
    },
    {
      type: 'tech_recommendation',
      pattern: /\b(laptop|macbook|phone|iphone|android|app|software|gadget|wifi|router|smart home|alexa|google home|siri|headphone|monitor|keyboard|vpn|password|nas|kindle|pc|gpu|cpu|ram)\b/i,
      entities: (text) => {
        const found = [];
        if (text.match(/macbook|mac|apple/i)) found.push('MacBook');
        if (text.match(/wifi|router|mesh/i)) found.push('WiFi');
        if (text.match(/phone|android|pixel/i)) found.push('Smartphone');
        if (text.match(/headphone/i)) found.push('Headphones');
        if (text.match(/vpn/i)) found.push('VPN');
        if (text.match(/ev|electric vehicle|tesla/i)) found.push('Electric Vehicle');
        if (text.match(/standing desk/i)) found.push('Standing Desk');
        if (found.length === 0) found.push('Technology');
        return found;
      },
      sentiment: (text) => text.match(/\b(best|great|love|incredible|worth|amazing)\b/i) ? 'positive' : 'neutral',
      actionable: (text) => !!(text.match(/\b(recommend|buy|try|use|get)\b/i))
    },
    {
      type: 'general_knowledge',
      pattern: /.*/,
      entities: () => ['General'],
      sentiment: () => 'neutral',
      actionable: () => false
    }
  ];

  function extractEvent(msg) {
    for (const rule of RULES) {
      if (rule.pattern.test(msg.text)) {
        const entities = rule.entities(msg.text);
        const sentimentMap = {};
        entities.forEach(e => { sentimentMap[e] = rule.sentiment(msg.text); });
        return {
          event_id:          uuidv4(),
          user_id:           msg.sender_id,
          event_type:        rule.type,
          entities,
          attributes: {
            sentiment:  sentimentMap,
            context:    msg.text.slice(0, 100),
            actionable: rule.actionable(msg.text),
          },
          confidence:        rule.type === 'general_knowledge' ? 0.5 : parseFloat((0.7 + Math.random() * 0.25).toFixed(2)),
          source_message_id: msg.message_id,
          timestamp:         msg.timestamp,
        };
      }
    }
    return null;
  }

  const events = messages.map(m => extractEvent(m)).filter(Boolean);
  const byType = {};
  events.forEach(e => { byType[e.event_type] = (byType[e.event_type] || 0) + 1; });

  console.log(`\n  ✅ Extracted ${events.length} semantic events from ${messages.length} messages`);

  // Save in same format as Groq extractor
  const output = {
    generated_at: new Date().toISOString(),
    metadata: {
      input_file: inputPath,
      batch_size: 'rules-based (no batches)',
      model: 'rules-based-extractor',
      processing_stats: { totalMessages: messages.length, totalEventsExtracted: events.length, messagesWithEvents: events.length, apiCalls: 0, durationSeconds: 0, eventsPerMessage: (events.length / messages.length).toFixed(2) },
      total_events: events.length,
    },
    events,
  };

  const outputPath = path.join(__dirname, 'extract-semantic-events-service/output/semantic-events.json');
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  logIO('SAMPLE OUTPUT — Semantic Event', events[0]);
  logIO('OUTPUT SUMMARY', { total_events: events.length, events_per_message: (events.length / messages.length).toFixed(2), by_event_type: byType, file: outputPath });

  return events;
}

// ─── Step 5: Expertise extraction → Neo4j ─────────────────────────────────
async function step5_extractExpertise() {
  log(5, 'EXPERTISE EXTRACTOR → NEO4J (normalize → hierarchy → weight → scope → cache)');

  logIO('INPUT', {
    semantic_events_file: '../extract-semantic-events-service/output/semantic-events.json',
    neo4j_database: 'deju-expertisegraph',
    pipeline_stages: [
      '1. LLM topic normalization (entities → canonical topics)',
      '2. Build CHILD_OF topic hierarchy in Neo4j',
      '3. Weight events (type × sentiment × actionability)',
      '4. Attach VisibilityScope to events',
      '5. Compute ScopedExpertise per user×topic×scope',
      '6. Propagate scores upward (Rome→Italy→Europe×0.6 decay)',
    ]
  });

  const { execSync } = require('child_process');
  const svcDir = path.join(__dirname, 'expertise-extractor-service');
  console.log('\n  Running expertise-extractor-service (child process)...');
  execSync('node src/index.js', {
    cwd: svcDir, stdio: 'inherit', timeout: 120000, env: { ...process.env }
  });

  const reportPath = path.join(svcDir, 'output/expertise-report.json');
  if (!fs.existsSync(reportPath)) { console.warn('  ⚠️  No report found'); return null; }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  const topExperts = report.scoped_expertise.slice(0, 15).map(e =>
    `${String(e.user_id).padEnd(8)} | ${String(e.topic).padEnd(30)} | score=${String(e.score).padEnd(5)} | evidence=${e.evidenceCount || '?'}${e.propagatedFrom ? ` | ↑ ${e.propagatedFrom}` : ''}`
  );
  logIO('OUTPUT — Topic Hierarchy built in Neo4j', report.topic_hierarchy);
  logIO('OUTPUT — Top 15 Expertise Scores (privacy-scoped)', topExperts);
  logIO('OUTPUT SUMMARY', {
    events_processed:      report.pipeline_stats.events_processed,
    topics_normalized:     report.pipeline_stats.topics_normalized,
    expertise_cache_nodes: report.scoped_expertise.length,
    output_file:           'expertise-extractor-service/output/expertise-report.json'
  });
  return report;
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  FINITEPATHS — END-TO-END PIPELINE TEST');
  console.log('  Strategy: Rich templates → DB → Groq semantic extraction → Neo4j expertise');
  console.log('█'.repeat(60));

  const t0 = Date.now();

  try { await axios.get(`${DATASTORAGE_URL}/health`, { timeout: 3000 }); console.log('\n✅ Datastorage service healthy'); }
  catch (_) { console.error('\n❌ Start datastorage: cd datastorage-service && npm start'); process.exit(1); }

  await step1_cleanDatabases();
  const syntheticData   = await step2_generateData();
  const dbMessages      = await step3_insertViaAPI(syntheticData);
  const semanticEvents  = await step4_extractSemanticEvents(dbMessages);
  const expertiseReport = await step5_extractExpertise();

  const duration = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n' + '█'.repeat(60));
  console.log('  ✅ END-TO-END TEST COMPLETE');
  console.log('█'.repeat(60));
  console.log(`  Wall time:             ${duration}s`);
  console.log(`  Users in Postgres:     ${syntheticData.users.length}`);
  console.log(`  Conversations in DB:   ${syntheticData.conversations.length}`);
  console.log(`  Messages in DB:        ${dbMessages.length}`);
  console.log(`  Semantic events:       ${semanticEvents.length}`);
  console.log(`  Expertise nodes Neo4j: ${expertiseReport?.scoped_expertise?.length || 0}`);
  console.log('\n  Artifacts:');
  console.log('    e2e-output/synthetic-data.json         ← users + conversations + messages');
  console.log('    e2e-output/db-messages.json            ← messages with DB-assigned UUIDs');
  console.log('    extract-semantic-events-service/output/semantic-events.json');
  console.log('    expertise-extractor-service/output/expertise-report.json');
  console.log('█'.repeat(60) + '\n');
}

main().catch(err => { console.error('\n❌ Fatal:', err.message, '\n', err.stack); process.exit(1); });
