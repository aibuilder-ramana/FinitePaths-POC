/**
 * Generate 100 new synthetic messages across new casual/social topics:
 * cooking, fitness, parenting, pets, books, music, gardening, finance, movies, local events
 *
 * These supplement the existing travel/food/healthcare/home/tech messages.
 * Output: e2e-output/new-messages.json
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const USERS = [
  'user_01','user_02','user_03','user_04','user_05',
  'user_06','user_07','user_08','user_09','user_10',
  'user_11','user_12','user_13','user_14','user_15',
  'user_16','user_17','user_18','user_19','user_20'
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function ts() {
  const m = rand(4, 6), d = rand(1, 27), h = rand(8, 21), mn = rand(0, 59);
  return `2024-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}:00Z`;
}

const TOPICS = {
  cooking: {
    conv_id: uuidv4(),
    participants: ['user_01','user_11','user_15','user_18','user_03'],
    messages: [
      { sender: 'user_18', text: "Anyone have a go-to weeknight pasta recipe that's not just spaghetti bolognese?" },
      { sender: 'user_11', text: "Cacio e pepe takes 15 minutes and is absolutely divine. Just pasta, pecorino, black pepper. Technique matters." },
      { sender: 'user_01', text: "Agreed on cacio e pepe! The trick is reserving a full cup of pasta water and adding it slowly." },
      { sender: 'user_15', text: "I've been obsessed with one-pan chicken thighs lately. Season well, sear skin-down, finish in oven at 425 for 20 min." },
      { sender: 'user_03', text: "For meal prep Sundays: roasted sheet pan veggies + grains + a protein. Mix and match all week." },
      { sender: 'user_18', text: "How do you guys feel about cast iron? I've been avoiding it because of the 'seasoning' maintenance." },
      { sender: 'user_01', text: "Cast iron is life-changing once it's seasoned. I haven't used non-stick in 3 years." },
      { sender: 'user_11', text: "For baking I use a Dutch oven for sourdough — gives it that bakery crust." },
      { sender: 'user_15', text: "My sourdough starter is 2 years old and I treat it like a pet. Highly recommend getting into sourdough." },
      { sender: 'user_03', text: "Any good YouTube channels for learning knife skills? Mine are terrible." },
      { sender: 'user_18', text: "Joshua Weissman and Internet Shaquille on YouTube for cooking fundamentals. Both are incredible." },
      { sender: 'user_01', text: "Salt Fat Acid Heat by Samin Nosrat changed how I think about cooking entirely." },
      { sender: 'user_11', text: "Also The Food Lab by J. Kenji López-Alt is the science-based cooking bible." },
    ]
  },
  fitness: {
    conv_id: uuidv4(),
    participants: ['user_03','user_06','user_14','user_16','user_17'],
    messages: [
      { sender: 'user_03', text: "Anyone have thoughts on Pilates vs yoga for core strength? I teach Pilates but curious about others' experience." },
      { sender: 'user_17', text: "As a nurse I recommend both but for different reasons. Yoga for stress, Pilates for functional strength." },
      { sender: 'user_06', text: "I cycle weekends but trying to add strength training. Any beginner program recommendations?" },
      { sender: 'user_14', text: "Starting Strength or StrongLifts 5x5 for beginners — simple, effective, compound movements only." },
      { sender: 'user_16', text: "I've been doing freeletics since I travel constantly. No equipment, adapts to your level." },
      { sender: 'user_03', text: "Zone 2 cardio is so underrated. 45 mins at conversational pace, 3x a week. Incredible for longevity." },
      { sender: 'user_17', text: "100% on zone 2. As a nurse I see what lack of cardio does long-term. Even walking counts." },
      { sender: 'user_06', text: "How are people tracking sleep and recovery? Garmin or Whoop worth it?" },
      { sender: 'user_14', text: "Garmin Forerunner 265 is the sweet spot — accurate, battery life is great, not overpriced." },
      { sender: 'user_16', text: "I use Oura ring. Sleep data is accurate and actionable. Worth it if you're serious about recovery." },
      { sender: 'user_03', text: "Protein intake — how much are people actually hitting? I struggle to get 100g/day." },
      { sender: 'user_17', text: "Greek yogurt, cottage cheese, eggs at every meal. Protein powder is fine but whole food first." },
    ]
  },
  pets: {
    conv_id: uuidv4(),
    participants: ['user_13','user_09','user_04','user_05','user_20'],
    messages: [
      { sender: 'user_13', text: "My golden retriever keeps destroying furniture when I leave. Any separation anxiety tips?" },
      { sender: 'user_09', text: "Kong filled with frozen peanut butter. Buys me an hour. Also crate training helped our lab enormously." },
      { sender: 'user_04', text: "I'm a retired teacher and adopted a senior dog last year — best decision. Senior dogs are so calm." },
      { sender: 'user_13', text: "Anyone use a dog trainer for anxiety issues specifically?" },
      { sender: 'user_05', text: "Canine Good Citizen trainers specialize in behavioral issues. Look for a Certified Applied Animal Behaviorist." },
      { sender: 'user_20', text: "Our vet recommended DAP (dog appeasing pheromone) diffusers for our anxious rescue. Made a difference." },
      { sender: 'user_13', text: "What food brands are people trusting? So confusing with all the recalls." },
      { sender: 'user_09', text: "Stick to brands with AAFCO feeding trials: Hill's, Royal Canin, Purina Pro Plan are the most studied." },
      { sender: 'user_04', text: "Any cat people? My cat is 15 and starting to show kidney issues. Tips for managing?" },
      { sender: 'user_05', text: "For senior cats with kidney issues — wet food is critical for hydration. Our vet prescribed Hill's k/d diet." },
      { sender: 'user_20', text: "Sub-Q fluids at home for kidney cats is very manageable once you learn. Ask your vet to teach you." },
      { sender: 'user_13', text: "Best pet insurance recommendations? Just got a puppy and trying to decide." },
      { sender: 'user_09', text: "Trupanion for serious illness coverage. Healthy Paws for value. Get it before any pre-existing conditions show up." },
    ]
  },
  books: {
    conv_id: uuidv4(),
    participants: ['user_13','user_08','user_12','user_01','user_07'],
    messages: [
      { sender: 'user_13', text: "Book club next meeting — we're reading 'The Covenant of Water' by Abraham Verghese. Anyone read it?" },
      { sender: 'user_01', text: "On my list! Loved 'Cutting for Stone' by same author. Beautiful writing." },
      { sender: 'user_08', text: "Just finished 'Tomorrow and Tomorrow and Tomorrow' — genuinely one of the best novels I've read in years." },
      { sender: 'user_12', text: "That one destroyed me emotionally in the best way. The friendship dynamic is so real." },
      { sender: 'user_07', text: "As a travel blogger I love 'A Year in Provence' by Peter Mayle. Every page makes you want to go to France." },
      { sender: 'user_13', text: "What's everyone's non-fiction recommendations? I want to read more this year." },
      { sender: 'user_08', text: "Atomic Habits is overrecommended but genuinely works. Also 'The Psychology of Money' by Morgan Housel." },
      { sender: 'user_01', text: "Braiding Sweetgrass by Robin Wall Kimmerer. Changed how I see nature. Incredibly moving." },
      { sender: 'user_12', text: "Spare time lately I've been doing audiobooks on commute. Audible subscription has been worth every cent." },
      { sender: 'user_07', text: "I read 40+ books a year. Secret: Libby app + local library card. Completely free." },
      { sender: 'user_13', text: "Genre fiction recommendations? Looking for something fun, not literary." },
      { sender: 'user_08', text: "The Name of the Wind by Patrick Rothfuss for fantasy. The Thursday Murder Club for cozy mystery." },
    ]
  },
  gardening: {
    conv_id: uuidv4(),
    participants: ['user_04','user_11','user_19','user_05','user_09'],
    messages: [
      { sender: 'user_04', text: "Spring planting season! What's everyone putting in their garden this year?" },
      { sender: 'user_11', text: "Starting a kitchen herb garden — basil, rosemary, thyme, mint. As a nutritionist I want fresh herbs always." },
      { sender: 'user_19', text: "Raised beds are the best investment I made in my backyard. Cedar boards, 12 inches deep, compost mix." },
      { sender: 'user_04', text: "I've been composting for 3 years. Zero kitchen scraps to waste and my soil is incredible now." },
      { sender: 'user_05', text: "New homeowner here — what's the lowest maintenance way to have a nice looking front yard?" },
      { sender: 'user_19', text: "Native plants. They're adapted to your climate, drought resistant, need almost no fertilizer, attract pollinators." },
      { sender: 'user_09', text: "Raised beds with drip irrigation on a timer. Set it and forget it. I harvest tomatoes all summer." },
      { sender: 'user_04', text: "Tomatoes — who's starting from seed vs buying transplants?" },
      { sender: 'user_11', text: "Start from seed for heirloom varieties you can't find at nurseries. Buy transplants for basics." },
      { sender: 'user_19', text: "Square foot gardening method changed my yield. Intensive planting, zero wasted space." },
      { sender: 'user_05', text: "Any resources for learning? I've killed every plant I've tried." },
      { sender: 'user_04', text: "Epic Gardening YouTube channel. Also 'The Vegetable Gardener's Bible' by Edward Smith is definitive." },
      { sender: 'user_09', text: "Start with zucchini. Basically impossible to kill and incredibly productive." },
    ]
  },
  finance: {
    conv_id: uuidv4(),
    participants: ['user_08','user_10','user_02','user_16','user_12'],
    messages: [
      { sender: 'user_08', text: "Is anyone else watching the market volatility? Trying to figure out if now is a buy opportunity." },
      { sender: 'user_10', text: "As a real estate agent I see a different volatility — housing market is cooling but still elevated." },
      { sender: 'user_02', text: "I just stick to index funds and don't look at the market. Time in market > timing the market." },
      { sender: 'user_16', text: "Remote work savings has been real. Living in Portugal, saving 40% more than I was in NYC." },
      { sender: 'user_12', text: "As a college student — anyone have advice on starting to invest with small amounts?" },
      { sender: 'user_08', text: "Fidelity Zero funds have no minimums and zero expense ratios. Start with $1 if you want." },
      { sender: 'user_02', text: "Roth IRA first if you're young. Tax-free growth is incredible over 40 years. Max it out." },
      { sender: 'user_10', text: "House hacking — buying a multi-unit, living in one unit, renting others. Best wealth building I know." },
      { sender: 'user_16', text: "Anyone doing geographic arbitrage seriously? Living abroad to stretch income further?" },
      { sender: 'user_08', text: "The FIRE movement is interesting but seems extreme. I want to actually enjoy my 30s and 40s." },
      { sender: 'user_02', text: "Barista FIRE is more realistic — semi-retire with part-time work you enjoy. Best of both worlds." },
      { sender: 'user_12', text: "What budgeting app actually works? I've tried Mint and YNAB." },
      { sender: 'user_10', text: "YNAB changed my financial life. Steep learning curve but worth it. It's a mindset shift." },
    ]
  },
  movies_tv: {
    conv_id: uuidv4(),
    participants: ['user_08','user_13','user_07','user_14','user_12'],
    messages: [
      { sender: 'user_13', text: "Has anyone watched 'Succession'? My partner and I just started and we're already obsessed." },
      { sender: 'user_08', text: "Succession is one of the greatest shows ever made. Season 3 finale will ruin you." },
      { sender: 'user_07', text: "The Bear on Hulu is the most stressful and brilliant show about cooking/restaurants I've ever seen." },
      { sender: 'user_14', text: "The Bear is visually stunning too. As a photographer I love the single-take episode in season 1." },
      { sender: 'user_12', text: "For movie recs — anything that absolutely destroyed you emotionally this year?" },
      { sender: 'user_13', text: "Past Lives. I cried twice. Beautiful quiet film about love and what could have been." },
      { sender: 'user_08', text: "Oppenheimer on IMAX. Even if you think you won't like a 3-hour historical film, go. Changed my perspective." },
      { sender: 'user_07', text: "For documentaries: 'Free Solo' is still the most tense thing I've ever watched." },
      { sender: 'user_14', text: "100% on Free Solo. I'm a climber and watching that was deeply uncomfortable." },
      { sender: 'user_12', text: "Best streaming service right now? Feeling like I'm paying for too many." },
      { sender: 'user_13', text: "Rotate them. Subscribe, binge one show, cancel, subscribe to next. I save $40/month." },
      { sender: 'user_08', text: "HBO Max has the best catalog per dollar if you had to pick one. Letterboxd app for tracking movies." },
    ]
  },
  music: {
    conv_id: uuidv4(),
    participants: ['user_14','user_16','user_08','user_07','user_03'],
    messages: [
      { sender: 'user_16', text: "Anyone been to any good live music recently? Looking for inspiration for gigs while traveling." },
      { sender: 'user_14', text: "Photographed a Bon Iver show last month — absolutely transcendent live. Very different from recorded." },
      { sender: 'user_07', text: "Electronic music scene in Berlin is something else. Berghain was life-changing even though I waited 4 hours." },
      { sender: 'user_08', text: "Austin City Limits festival is worth it every year. Lineup diversity is incredible." },
      { sender: 'user_03', text: "I teach Pilates and music is everything in my classes. Really matters for energy and rhythm." },
      { sender: 'user_16', text: "What are people listening to for focus/work? I need a new playlist." },
      { sender: 'user_14', text: "Brian Eno's ambient works for deep focus. Also Lofi Girl on YouTube is a cliché but it works." },
      { sender: 'user_08', text: "For coding/focus I use Focus@Will — scientifically designed music that maintains attention spans." },
      { sender: 'user_07', text: "I've been rediscovering jazz. Miles Davis Kind of Blue is still the greatest album ever made." },
      { sender: 'user_03', text: "For workout music — hyperpop and hyper-specific Spotify workout playlists at 150+ BPM." },
      { sender: 'user_16', text: "Spotify Wrapped this year told me I'm in the top 0.1% of Radiohead listeners. I have no regrets." },
      { sender: 'user_14', text: "Concerts as experiences — I always buy floor/GA tickets now. The energy vs seated is incomparable." },
    ]
  },
  parenting_extra: {
    conv_id: uuidv4(),
    participants: ['user_09','user_06','user_04','user_17','user_13'],
    messages: [
      { sender: 'user_09', text: "Screen time rules for toddlers — how strict is everyone? I feel like I'm failing constantly." },
      { sender: 'user_06', text: "As a pediatrician: AAP recommends zero screen before 18 months except video calls. After 2, 1 hr/day quality content." },
      { sender: 'user_17', text: "Quality matters more than quantity. PBS Kids and Sesame Street are genuinely educational." },
      { sender: 'user_04', text: "As a retired teacher: reading aloud to kids is the single most powerful thing you can do for their development." },
      { sender: 'user_09', text: "Starting solids tips? My 6-month-old is ready and I'm terrified of allergens." },
      { sender: 'user_06', text: "Early introduction of common allergens (peanuts, eggs) actually reduces allergy risk. LEAP study proved it." },
      { sender: 'user_17', text: "Baby-led weaning has fantastic evidence behind it. Less purée stress, better self-regulation later." },
      { sender: 'user_13', text: "Sleep training — what worked for your families? We're at week 3 of no sleep." },
      { sender: 'user_06', text: "Ferber method at 6 months worked for both my kids. Hard for 3 nights, then transformed." },
      { sender: 'user_17', text: "Every child is different. What works matters less than being consistent. Pick a method and commit." },
      { sender: 'user_04', text: "Grandparent perspective: enjoy every stage, even the exhausting ones. It goes so fast." },
      { sender: 'user_09', text: "What's the best diaper bag? Currently using a backpack that's falling apart." },
      { sender: 'user_17', text: "Freshly Picked or Skip Hop for style + function. Get one with insulated pockets for bottles." },
    ]
  },
  local_events: {
    conv_id: uuidv4(),
    participants: ['user_10','user_01','user_05','user_08','user_15'],
    messages: [
      { sender: 'user_10', text: "Anyone going to the Austin Food & Wine Festival this weekend? Worth the ticket price?" },
      { sender: 'user_01', text: "Went last year — the chef demonstrations are the best part. Skip the grand tasting, it's too crowded." },
      { sender: 'user_15', text: "My bakery has a booth this year! Come find me — I'll be near the Dessert Pavilion." },
      { sender: 'user_08', text: "SXSW is overwhelming but I always find amazing things in the smaller Interactive sessions." },
      { sender: 'user_10', text: "For locals: the Barton Springs swim this summer has been incredible. Water is crystal clear." },
      { sender: 'user_05', text: "New homeowner question: what neighborhood events/associations are actually worth joining?" },
      { sender: 'user_01', text: "Nextdoor is great for practical info. Most neighborhood associations are fine if you want to meet people." },
      { sender: 'user_10', text: "Hyde Park neighborhood association is very active and has great summer block parties." },
      { sender: 'user_08', text: "Farmers markets — which Austin ones are actually worth waking up early for?" },
      { sender: 'user_15', text: "SFC Farmers Market at Republic Square Park. Best produce vendors, great prepared food, musicians." },
      { sender: 'user_01', text: "Mueller Farmers Market for families — there's a playground right there so kids can run." },
      { sender: 'user_05', text: "Anyone know of volunteer opportunities that are accessible for busy working adults?" },
      { sender: 'user_10', text: "Austin Parks Foundation does trail workdays every Saturday 8-11am. Easy to drop in, huge impact." },
    ]
  }
};

// Build message list
const messages = [];
// Start 90 days ago so messages spread from 90→7 days ago (realistic recency)
let baseTime = Date.now() - (90 * 24 * 60 * 60 * 1000);

for (const [topic, data] of Object.entries(TOPICS)) {
  const convId = data.conv_id;
  let offset = 0;
  for (const msg of data.messages) {
    offset += rand(5, 20) * 60 * 1000; // 5-20 min between messages
    messages.push({
      message_id: uuidv4(),
      conversation_id: convId,
      sender_id: msg.sender,
      text: msg.text,
      timestamp: new Date(baseTime + offset).toISOString()
    });
  }
  baseTime += 2 * 24 * 60 * 60 * 1000; // next topic starts 2 days later
}

const outPath = path.join(__dirname, 'e2e-output', 'new-messages.json');
fs.writeFileSync(outPath, JSON.stringify(messages, null, 2));
console.log(`✅ Generated ${messages.length} messages across ${Object.keys(TOPICS).length} topics`);
console.log(`   Output: ${outPath}`);
console.log('\nTopics covered:');
for (const [topic, data] of Object.entries(TOPICS)) {
  console.log(`  - ${topic}: ${data.messages.length} messages (conv: ${data.conv_id.slice(0,8)}...)`);
}
